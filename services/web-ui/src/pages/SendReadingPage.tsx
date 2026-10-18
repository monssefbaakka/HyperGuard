import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { ApiError, fetchTelemetry, publishEvent } from '../api/client';
import type { Facets, TelemetryIngestionRequest } from '../api/types';
import { Button, Field, Select, TextInput, toOptions } from '../components/Controls';
import { ErrorBanner } from '../components/Feedback';
import {
  formatInstant,
  formatMeasurement,
  formatValueWithUnit,
  humanizeLabel,
  isoToLocalInput,
  localInputToIso,
} from '../components/format';
import { FaultPresetsCard, OscilloscopeDeck, SpectrumAndPhase, SynthesizerControls } from '../components/WaveformPreview';
import { useSignalSynthesizer, type FaultArchetype } from '../hooks/useSignalSynthesizer';
import type { PageId } from './HomePage';

interface SendReadingPageProps {
  tenantId: string;
  facets: Facets | null;
  technical: boolean;
  onPublished: () => void;
  onNavigate: (page: PageId) => void;
}

/** Sentinel used by the device and measurement pickers to reveal a free-text box. */
const OTHER = '__other__';

const UNIT_OPTIONS = [
  { value: 'C', label: '°C (Celsius)' },
  { value: 'F', label: '°F (Fahrenheit)' },
  { value: '%', label: '% (percent)' },
  { value: 'ppm', label: 'ppm' },
  { value: 'hPa', label: 'hPa' },
];

/** The topic ingestion-service publishes accepted events to (`pulsestream.kafka.topics.raw`). */
const RAW_TOPIC = 'telemetry.events.raw';
/** Events sent by one press of "Inject anomaly burst". */
const BURST_SIZE = 10;

interface AdvancedState {
  eventId: string;
  eventType: string;
  source: string;
  version: string;
  deviceType: string;
  timestamp: string;
  tenantId: string;
}

/**
 * `event_id` is unique in the readings table, so every submission needs its own. UUIDs are 36
 * characters, inside the column's 50.
 */
function newEventId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return `evt-${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`;
}

function defaultAdvanced(tenantId: string): AdvancedState {
  return {
    eventId: newEventId(),
    eventType: 'telemetry.reading',
    source: 'web-ui',
    version: '1.0',
    deviceType: 'sensor',
    timestamp: isoToLocalInput(new Date().toISOString()),
    tenantId: tenantId || 'tenant-a',
  };
}

type Phase =
  | { kind: 'idle' }
  | { kind: 'sending' }
  | { kind: 'waiting'; eventId: string; summary: string }
  | { kind: 'arrived'; summary: string }
  | { kind: 'slow'; summary: string };

/** How long to keep looking for the reading before telling the user it is just running late. */
const ARRIVAL_TIMEOUT_MS = 45_000;
const ARRIVAL_POLL_MS = 2_000;

interface DispatchLogEntry {
  eventId: string;
  deviceId: string;
  metric: string;
  unit: string;
  value: number;
  signalType: string;
  /** Strongest DFT bin of the generated signal when the event went out, in Hz. */
  fftPeakHz: number | null;
  anomalyVector: FaultArchetype;
  sentAt: string;
  status: 'ok' | 'error' | 'dropped';
  /** Real round-trip time of the publishEvent() HTTP call, measured client-side — not a broker ack. */
  latencyMs: number;
}
const MAX_LOG_ROWS = 8;

const VECTOR_LABELS: Record<Exclude<FaultArchetype, null>, string> = {
  bearing: 'Bearing seizure',
  thermal: 'Thermal runaway',
  cavitation: 'Cavitation',
  dropout: 'Sensor dropout',
};

export function SendReadingPage({
  tenantId,
  facets,
  technical,
  onPublished,
  onNavigate,
}: SendReadingPageProps) {
  const [deviceChoice, setDeviceChoice] = useState(OTHER);
  const [customDevice, setCustomDevice] = useState('sensor-1');
  const [metricChoice, setMetricChoice] = useState(OTHER);
  const [customMetric, setCustomMetric] = useState('temperature');
  const [value, setValue] = useState('21.5');
  const [unit, setUnit] = useState('C');
  const [location, setLocation] = useState('warehouse-1');

  const [advanced, setAdvanced] = useState<AdvancedState>(() => defaultAdvanced(tenantId));
  const [phase, setPhase] = useState<Phase>({ kind: 'idle' });
  const [error, setError] = useState<Error | ApiError | null>(null);
  const [dispatchLog, setDispatchLog] = useState<DispatchLogEntry[]>([]);
  const [producerOn, setProducerOn] = useState(false);
  const [bursting, setBursting] = useState(false);

  const synth = useSignalSynthesizer();

  const cancelWatch = useRef<(() => void) | null>(null);
  useEffect(() => () => cancelWatch.current?.(), []);

  // Default to a device and measurement the platform already knows about, so the first send lands
  // in an existing series instead of creating a one-off device.
  useEffect(() => {
    const devices = facets?.devices ?? [];
    if (devices.length > 0 && deviceChoice === OTHER && customDevice === 'sensor-1') {
      setDeviceChoice(devices[0]);
    }
  }, [facets, deviceChoice, customDevice]);

  useEffect(() => {
    const metrics = facets?.metrics ?? [];
    if (metrics.length > 0 && metricChoice === OTHER && customMetric === 'temperature') {
      setMetricChoice(metrics[0]);
    }
  }, [facets, metricChoice, customMetric]);

  const deviceId = deviceChoice === OTHER ? customDevice.trim() : deviceChoice;
  const metric = metricChoice === OTHER ? customMetric.trim() : metricChoice;
  const numericValue = Number(value);
  const valueValid = value.trim() !== '' && Number.isFinite(numericValue);
  const canSubmit = Boolean(deviceId && metric && valueValid) && phase.kind !== 'sending';

  /**
   * Publishes one event and records what actually happened to it. Shared by the manual send, the
   * sandbox producer and the anomaly burst so every row in the dispatcher is a real HTTP call.
   */
  const publishSample = useCallback(
    async (
      sampleValue: number,
      eventId = newEventId(),
      timestamp = new Date().toISOString(),
    ): Promise<boolean> => {
      const request: TelemetryIngestionRequest = {
        eventId,
        tenantId: advanced.tenantId,
        eventType: advanced.eventType,
        timestamp,
        source: advanced.source,
        version: advanced.version,
        payload: {
          deviceId,
          deviceType: advanced.deviceType,
          metric,
          value: sampleValue,
          unit,
          location,
        },
      };

      const base = {
        eventId,
        deviceId,
        metric,
        unit,
        value: sampleValue,
        signalType: `${synth.waveType}_wave_base`.toUpperCase(),
        fftPeakHz: synth.fundamentalHz,
        anomalyVector: synth.armedFault,
        sentAt: new Date().toISOString(),
      };

      const startedAt = performance.now();
      try {
        await publishEvent(request);
        const latencyMs = Math.round(performance.now() - startedAt);
        setDispatchLog((log) => [{ ...base, status: 'ok' as const, latencyMs }, ...log].slice(0, MAX_LOG_ROWS));
        return true;
      } catch (cause) {
        const latencyMs = Math.round(performance.now() - startedAt);
        setDispatchLog((log) => [{ ...base, status: 'error' as const, latencyMs }, ...log].slice(0, MAX_LOG_ROWS));
        setError(cause instanceof Error ? cause : new Error(String(cause)));
        return false;
      }
    },
    [advanced, deviceId, metric, unit, location, synth.waveType, synth.fundamentalHz, synth.armedFault],
  );

  const publishRef = useRef(publishSample);
  publishRef.current = publishSample;
  const liveSampleRef = useRef(synth.liveSample);
  liveSampleRef.current = synth.liveSample;
  const baselineRef = useRef(numericValue);
  baselineRef.current = valueValid ? numericValue : 0;
  const dropoutRef = useRef(synth.dropoutShare);
  dropoutRef.current = synth.dropoutShare;

  /**
   * The sandbox producer publishes the baseline reading plus the synthesizer's live sample, at the
   * configured rate. With the dropout archetype armed it really skips that share of dispatches, so
   * the gap shows up in the stored series rather than only in the trace.
   */
  useEffect(() => {
    if (!producerOn) {
      return;
    }
    const period = Math.max(50, Math.round(1000 / synth.dispatchRate));
    let publishedSinceRefresh = 0;

    const timer = window.setInterval(() => {
      if (dropoutRef.current > 0 && Math.random() < dropoutRef.current) {
        setDispatchLog((log) =>
          [
            {
              eventId: newEventId(),
              deviceId,
              metric,
              unit,
              value: 0,
              signalType: 'DROPPED_FRAME',
              fftPeakHz: null,
              anomalyVector: 'dropout' as FaultArchetype,
              sentAt: new Date().toISOString(),
              status: 'dropped' as const,
              latencyMs: 0,
            },
            ...log,
          ].slice(0, MAX_LOG_ROWS),
        );
        return;
      }

      void publishRef.current(baselineRef.current + liveSampleRef.current).then((ok) => {
        publishedSinceRefresh += 1;
        // Refreshing the whole console on every event would hammer the read API; once a second is
        // enough for the other screens to keep up.
        if (ok && publishedSinceRefresh >= synth.dispatchRate) {
          publishedSinceRefresh = 0;
          onPublished();
        }
      });
    }, period);

    return () => window.clearInterval(timer);
  }, [producerOn, synth.dispatchRate, deviceId, metric, unit, onPublished]);

  /**
   * Watches for the reading to come back out of the pipeline.
   *
   * <p>Ingestion answers as soon as the event reaches Kafka, so without this the screen would say
   * "sent" while the Readings tab still showed nothing — the single most confusing moment in the
   * whole flow for someone who does not know there is a queue in the middle.
   */
  const watchForArrival = useCallback(
    (eventId: string, watchedDevice: string, summary: string) => {
      const started = Date.now();
      let timer = 0;
      let cancelled = false;

      const poll = async () => {
        if (cancelled) {
          return;
        }
        try {
          const page = await fetchTelemetry({ deviceId: watchedDevice, size: 20 });
          if (cancelled) {
            return;
          }
          if (page.content.some((row) => row.eventId === eventId)) {
            setPhase({ kind: 'arrived', summary });
            onPublished();
            return;
          }
        } catch {
          // A failed poll is not a failed send; keep waiting and let the deadline decide.
        }

        if (Date.now() - started > ARRIVAL_TIMEOUT_MS) {
          setPhase({ kind: 'slow', summary });
          onPublished();
          return;
        }
        timer = window.setTimeout(poll, ARRIVAL_POLL_MS);
      };

      timer = window.setTimeout(poll, ARRIVAL_POLL_MS);

      cancelWatch.current = () => {
        cancelled = true;
        window.clearTimeout(timer);
      };
    },
    [onPublished],
  );

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!canSubmit) {
      return;
    }

    cancelWatch.current?.();
    setError(null);
    setPhase({ kind: 'sending' });

    const eventId = advanced.eventId;
    const summary = `${humanizeLabel(metric)} of ${formatValueWithUnit(numericValue, unit)} from ${deviceId}`;
    const sent = await publishSample(
      numericValue,
      eventId,
      localInputToIso(advanced.timestamp) ?? new Date().toISOString(),
    );

    if (!sent) {
      setPhase({ kind: 'idle' });
      return;
    }

    setPhase({ kind: 'waiting', eventId, summary });
    // The id must change before the next send or the processor would overwrite the same row
    // instead of adding one; the rest of the form is kept so a series is quick to build up.
    setAdvanced((current) => ({
      ...current,
      eventId: newEventId(),
      timestamp: isoToLocalInput(new Date().toISOString()),
    }));
    watchForArrival(eventId, deviceId, summary);
  };

  const injectBurst = async () => {
    setBursting(true);
    setError(null);
    for (let i = 0; i < BURST_SIZE; i += 1) {
      await publishRef.current(baselineRef.current + liveSampleRef.current);
    }
    setBursting(false);
    onPublished();
  };

  const armPreset = (presetValue: string, fault: FaultArchetype) => {
    setValue(presetValue);
    synth.setArmedFault(fault);
  };

  const lastLatency = dispatchLog.find((entry) => entry.status === 'ok')?.latencyMs ?? null;
  const lastKey = dispatchLog[0]?.eventId ?? null;

  return (
    <div className="flex flex-col gap-space-lg">
      <div className="rounded-xl bg-surface-container-lowest p-space-lg shadow-sm">
        <div className="flex items-center gap-space-xs font-label-sm text-label-sm uppercase tracking-wider text-on-surface-variant">
          <span>HyperGuard</span>
          <span className="material-symbols-outlined text-[14px]" aria-hidden="true">
            chevron_right
          </span>
          <span>Sandbox</span>
          <span className="material-symbols-outlined text-[14px]" aria-hidden="true">
            chevron_right
          </span>
          <span className="font-medium text-primary">Simulation Bench</span>
        </div>

        <div className="mt-1 flex flex-wrap items-start justify-between gap-space-md">
          <div className="min-w-0">
            <h2 className="font-display-lg text-display-lg font-semibold tracking-tight text-on-surface">
              Hardware-in-the-Loop &amp; Synthetic Anomaly Generator
            </h2>
            <p className="mt-1 max-w-[70ch] font-body-md text-body-md text-on-surface-variant">
              Transducer emulator and pulse synthesizer. The signal is generated here and dispatched into the
              real ingestion pipeline — every row in the dispatcher below is an actual HTTP publish.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-space-sm">
            <button
              type="button"
              onClick={() => setProducerOn((on) => !on)}
              className={`inline-flex items-center gap-2 rounded-full border px-3 py-2 font-label-md text-label-md font-semibold transition-colors ${
                producerOn
                  ? 'border-secondary bg-secondary-container text-on-secondary-container'
                  : 'border-outline-variant bg-surface-container-lowest text-on-surface-variant hover:bg-surface-container-low'
              }`}
              title={`Publishes ${synth.dispatchRate} event${synth.dispatchRate === 1 ? '' : 's'} per second while on`}
            >
              <span
                className={`relative h-5 w-9 rounded-full transition-colors ${
                  producerOn ? 'bg-secondary' : 'bg-surface-container-high'
                }`}
                aria-hidden="true"
              >
                <span
                  className={`absolute top-0.5 h-4 w-4 rounded-full bg-surface-container-lowest transition-all ${
                    producerOn ? 'left-[18px]' : 'left-0.5'
                  }`}
                />
              </span>
              Sandbox producer ({producerOn ? 'active' : 'idle'})
            </button>

            <Button
              onClick={() => {
                cancelWatch.current?.();
                setProducerOn(false);
                setAdvanced(defaultAdvanced(tenantId));
                setPhase({ kind: 'idle' });
                setError(null);
                setValue('21.5');
                synth.reset();
              }}
            >
              Zero baseline
            </Button>

            <button
              type="button"
              onClick={injectBurst}
              disabled={bursting || !valueValid || !deviceId || !metric}
              className="inline-flex items-center gap-1.5 rounded-lg bg-error px-4 py-2.5 font-label-md text-label-md font-semibold text-on-error shadow-sm transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-45"
              title={`Publishes ${BURST_SIZE} events back to back at the current baseline and archetype`}
            >
              <span className="material-symbols-outlined text-[18px]" aria-hidden="true">
                bolt
              </span>
              {bursting ? 'Injecting…' : 'Inject anomaly burst'}
            </button>
          </div>
        </div>
      </div>

      <ErrorBanner error={error} />

      {phase.kind === 'waiting' ? (
        <div className="flex items-start gap-space-md rounded-xl bg-surface-container-low p-space-md" role="status">
          <span
            className="mt-0.5 h-[18px] w-[18px] flex-none animate-spin rounded-full border-2 border-outline-variant border-t-primary"
            aria-hidden="true"
          />
          <div className="min-w-0">
            <p className="font-label-md text-label-md font-semibold text-on-surface">
              Sent — waiting for it to come through
            </p>
            <p className="mt-1 font-body-md text-body-md text-on-surface-variant">
              {phase.summary}. Readings pass through a queue, so this usually takes a few seconds.
            </p>
          </div>
        </div>
      ) : null}

      {phase.kind === 'arrived' ? (
        <div
          className="flex flex-wrap items-center justify-between gap-space-md rounded-xl bg-secondary-container/20 p-space-md"
          role="status"
        >
          <div className="min-w-0">
            <p className="font-label-md text-label-md font-semibold text-on-secondary-container">
              Your reading arrived
            </p>
            <p className="mt-1 font-body-md text-body-md text-on-surface-variant">
              {phase.summary} was recorded and is now visible in the platform.
            </p>
          </div>
          <Button variant="primary" onClick={() => onNavigate('readings')}>
            View it
          </Button>
        </div>
      ) : null}

      {phase.kind === 'slow' ? (
        <div
          className="flex flex-wrap items-center justify-between gap-space-md rounded-xl bg-surface-container-low p-space-md"
          role="status"
        >
          <div className="min-w-0">
            <p className="font-label-md text-label-md font-semibold text-on-surface">Still on its way</p>
            <p className="mt-1 font-body-md text-body-md text-on-surface-variant">
              {phase.summary} was accepted, but it has not been recorded yet. The platform may be working through
              a backlog — check the Readings tab again shortly.
            </p>
          </div>
          <Button onClick={() => onNavigate('readings')}>Open readings</Button>
        </div>
      ) : null}

      <form className="flex flex-col gap-space-lg" onSubmit={submit}>
        <div className="grid grid-cols-1 gap-space-lg xl:grid-cols-12 xl:items-start">
          <div className="flex flex-col gap-space-lg xl:col-span-4">
            <SynthesizerControls synth={synth} />
            <FaultPresetsCard synth={synth} onArm={armPreset} />
          </div>
          <div className="flex flex-col gap-space-lg xl:col-span-8">
            <OscilloscopeDeck synth={synth} />
            <SpectrumAndPhase synth={synth} />
          </div>
        </div>

        <div className="flex flex-col gap-space-md rounded-xl bg-surface-container-lowest p-space-lg shadow-sm">
          <span className="font-label-sm text-label-sm uppercase tracking-wider text-on-surface-variant">
            Dispatch target
          </span>
          <div className="grid grid-cols-1 gap-space-md sm:grid-cols-2">
            <Field label="Device" hint="Which device is reporting">
              <Select
                value={deviceChoice}
                options={[...toOptions(facets?.devices ?? []), { value: OTHER, label: 'Another device…' }]}
                onChange={setDeviceChoice}
              />
            </Field>
            {deviceChoice === OTHER ? (
              <Field label="Device name">
                <TextInput value={customDevice} onChange={setCustomDevice} placeholder="sensor-1" />
              </Field>
            ) : null}

            <Field label="Measurement" hint="What is being measured">
              <Select
                value={metricChoice}
                options={[
                  ...toOptions(facets?.metrics ?? [], humanizeLabel),
                  { value: OTHER, label: 'Something else…' },
                ]}
                onChange={setMetricChoice}
              />
            </Field>
            {metricChoice === OTHER ? (
              <Field label="Measurement name">
                <TextInput value={customMetric} onChange={setCustomMetric} placeholder="temperature" />
              </Field>
            ) : null}

            <Field label="Baseline reading" hint={valueValid ? 'The producer publishes this plus the live sample' : 'Enter a number'}>
              <div className="flex items-center gap-space-xs">
                <TextInput type="number" step="any" value={value} invalid={!valueValid} onChange={setValue} />
                <button
                  type="button"
                  className="flex-none rounded-lg border border-outline-variant px-space-sm py-2 font-label-sm text-label-sm text-on-surface-variant hover:border-outline hover:text-on-surface"
                  title="Copy the oscilloscope's current sample into this field"
                  onClick={() => setValue(synth.liveSample.toFixed(2))}
                >
                  Use live sample
                </button>
              </div>
            </Field>

            <Field label="Unit">
              <Select value={unit} options={UNIT_OPTIONS} onChange={setUnit} />
            </Field>

            <Field label="Location" hint="Where the device is">
              <TextInput value={location} onChange={setLocation} placeholder="warehouse-1" />
            </Field>
          </div>

          <div className="flex items-center gap-space-md">
            <Button type="submit" variant="primary" size="large" disabled={!canSubmit}>
              {phase.kind === 'sending' ? 'Sending…' : 'Dispatch single reading'}
            </Button>
          </div>
        </div>

        <details className="rounded-xl bg-surface-container-low p-space-md" open={technical}>
          <summary className="cursor-pointer font-label-md text-label-md font-semibold text-on-surface-variant">
            Advanced settings
          </summary>
          <p className="mb-space-md mt-space-sm max-w-[70ch] font-body-sm text-body-sm text-on-surface-variant">
            These are filled in for you and rarely need changing. They control the envelope the platform stores
            alongside the measurement.
          </p>
          <div className="grid grid-cols-1 gap-space-md sm:grid-cols-2">
            <Field label="Tenant">
              <TextInput
                value={advanced.tenantId}
                onChange={(next) => setAdvanced((current) => ({ ...current, tenantId: next }))}
              />
            </Field>
            <Field label="Recorded at" hint="Local time, sent as UTC">
              <TextInput
                type="datetime-local"
                value={advanced.timestamp}
                onChange={(next) => setAdvanced((current) => ({ ...current, timestamp: next }))}
              />
            </Field>
            <Field label="Device type">
              <TextInput
                value={advanced.deviceType}
                onChange={(next) => setAdvanced((current) => ({ ...current, deviceType: next }))}
              />
            </Field>
            <Field label="Event type">
              <TextInput
                value={advanced.eventType}
                onChange={(next) => setAdvanced((current) => ({ ...current, eventType: next }))}
              />
            </Field>
            <Field label="Source">
              <TextInput
                value={advanced.source}
                onChange={(next) => setAdvanced((current) => ({ ...current, source: next }))}
              />
            </Field>
            <Field label="Version">
              <TextInput
                value={advanced.version}
                onChange={(next) => setAdvanced((current) => ({ ...current, version: next }))}
              />
            </Field>
            <Field label="Event ID" hint="A new one is generated after each send">
              <TextInput
                value={advanced.eventId}
                onChange={(next) => setAdvanced((current) => ({ ...current, eventId: next }))}
              />
            </Field>
          </div>
        </details>
      </form>

      <div className="flex flex-col gap-space-md rounded-xl bg-surface-container-lowest p-space-lg shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-space-md">
          <div className="flex items-start gap-space-sm">
            <span className="material-symbols-outlined text-[22px] text-primary" aria-hidden="true">
              send
            </span>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-space-sm">
                <span className="font-headline-sm text-headline-sm font-semibold text-on-surface">
                  Live Kafka Dispatcher
                </span>
                <span className="rounded bg-secondary-container px-2 py-0.5 font-mono text-code-sm font-semibold text-on-secondary-container">
                  {dispatchLog.some((entry) => entry.status === 'ok') ? 'ACK 202 ACCEPTED' : 'IDLE'}
                </span>
              </div>
              <p className="mt-1 max-w-[60ch] font-body-sm text-body-sm text-on-surface-variant">
                Ingestion answers 202 once the event is on the topic; the latency below is the real round trip
                of that call, measured in the browser.
              </p>
            </div>
          </div>

          <dl className="grid grid-cols-2 gap-x-space-lg gap-y-1 rounded-lg bg-surface-container-low p-space-sm font-mono text-code-sm">
            <dt className="text-on-surface-variant">Topic</dt>
            <dd className="text-on-surface">{RAW_TOPIC}</dd>
            <dt className="text-on-surface-variant">Partition key</dt>
            <dd className="truncate text-on-surface" title={lastKey ?? undefined}>
              {lastKey ? `${lastKey.slice(0, 8)}… (eventId)` : 'eventId'}
            </dd>
            <dt className="text-on-surface-variant">Burst size</dt>
            <dd className="text-on-surface">{BURST_SIZE} records</dd>
            <dt className="text-on-surface-variant">Latency</dt>
            <dd className="text-on-surface">{lastLatency === null ? '—' : `${lastLatency} ms`}</dd>
          </dl>
        </div>

        {dispatchLog.length === 0 ? (
          <p className="rounded-lg bg-surface-container-low p-space-md font-body-md text-body-md text-on-surface-variant">
            Nothing dispatched yet this session. Turn the sandbox producer on, inject a burst, or send a single
            reading.
          </p>
        ) : (
          <div className="overflow-x-auto rounded-lg bg-surface-container-low">
            <table className="w-full text-left font-mono text-code-sm">
              <thead>
                <tr className="bg-surface-container uppercase tracking-wider text-on-surface-variant">
                  <th className="px-space-md py-space-xs">Event</th>
                  <th className="px-space-md py-space-xs">Transducer id</th>
                  <th className="px-space-md py-space-xs">Signal type</th>
                  <th className="px-space-md py-space-xs text-right">Sample value</th>
                  <th className="px-space-md py-space-xs text-right">FFT peak</th>
                  <th className="px-space-md py-space-xs">Anomaly vector</th>
                  <th className="px-space-md py-space-xs text-right">Cluster status</th>
                </tr>
              </thead>
              <tbody className="text-on-surface">
                {dispatchLog.map((entry) => (
                  <tr key={entry.eventId} className="border-t border-surface-container-high">
                    <td className="px-space-md py-space-xs text-on-surface-variant" title={formatInstant(entry.sentAt)}>
                      {entry.eventId.slice(0, 8)}
                    </td>
                    <td className="px-space-md py-space-xs font-medium text-primary">{entry.deviceId}</td>
                    <td className="px-space-md py-space-xs text-on-surface-variant">{entry.signalType}</td>
                    <td className="px-space-md py-space-xs text-right">
                      {entry.status === 'dropped' ? '—' : formatValueWithUnit(entry.value, entry.unit)}
                    </td>
                    <td className="px-space-md py-space-xs text-right text-on-surface-variant">
                      {entry.fftPeakHz === null ? '—' : `${formatMeasurement(entry.fftPeakHz)} Hz`}
                    </td>
                    <td className="px-space-md py-space-xs">
                      {entry.anomalyVector ? (
                        <span className="text-on-error-container">{VECTOR_LABELS[entry.anomalyVector]}</span>
                      ) : (
                        <span className="text-on-surface-variant">None (nominal)</span>
                      )}
                    </td>
                    <td className="px-space-md py-space-xs text-right">
                      {entry.status === 'ok' ? (
                        <span className="inline-flex items-center gap-1 font-semibold text-secondary">
                          <span className="h-1.5 w-1.5 rounded-full bg-secondary" aria-hidden="true" />
                          ACK 202 ({entry.latencyMs}ms)
                        </span>
                      ) : entry.status === 'dropped' ? (
                        <span className="inline-flex items-center gap-1 font-semibold text-on-tertiary-container">
                          <span className="h-1.5 w-1.5 rounded-full bg-tertiary" aria-hidden="true" />
                          DROPPED (archetype)
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 font-semibold text-error">
                          <span className="h-1.5 w-1.5 rounded-full bg-error" aria-hidden="true" />
                          FAILED ({entry.latencyMs}ms)
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
