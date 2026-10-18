import { useMemo, useState } from 'react';
import { fetchAnomalies, fetchKafkaTopology, fetchSeries } from '../api/client';
import type { AnomalyRecord } from '../api/types';
import { Button } from '../components/Controls';
import { CausalGraph, type CausalEdge, type CausalNode } from '../components/CausalGraph';
import { JsonPreview } from '../components/JsonPreview';
import { Sparkline } from '../components/Sparkline';
import { formatInstant, formatMeasurement, humanizeConstant, humanizeLabel } from '../components/format';
import { useAsyncData } from '../hooks/useAsyncData';
import { pearsonCorrelation, resampleUniform, zScoreAgainstHistory } from '../lib/signal';
import type { Incident } from './ForensicsPage';

interface IncidentDossierProps {
  incident: Incident;
  tenantId: string;
  dataVersion: number;
  onBack: () => void;
  onInspectDevice: (deviceId: string) => void;
}

const SEVERITY_TONE: Record<number, { badge: string; text: string; label: string }> = {
  3: { badge: 'bg-error-container text-on-error-container', text: 'text-error', label: 'CRITICAL' },
  2: { badge: 'bg-tertiary-fixed text-on-tertiary-fixed', text: 'text-tertiary', label: 'DEGRADED' },
  1: { badge: 'bg-primary-fixed text-on-primary-fixed', text: 'text-primary', label: 'ADVISORY' },
  0: { badge: 'bg-surface-container text-on-surface-variant', text: 'text-on-surface-variant', label: 'NOMINAL' },
};

const CORRELATION_POINTS = 40;
const CORRELATION_GRID = 16;
const RESOLVED_AFTER_MS = 15 * 60 * 1000;

function pickTriggerEvent(events: AnomalyRecord[]): AnomalyRecord {
  const RANK: Record<string, number> = { critical: 3, warning: 2, info: 1 };
  return [...events].sort((a, b) => {
    const rankDiff = (RANK[b.severity.toLowerCase()] ?? 0) - (RANK[a.severity.toLowerCase()] ?? 0);
    if (rankDiff !== 0) return rankDiff;
    const devA = Math.abs(a.value - a.threshold) / (Math.abs(a.threshold) || 1);
    const devB = Math.abs(b.value - b.threshold) / (Math.abs(b.threshold) || 1);
    return devB - devA;
  })[0];
}

interface KpiTileProps {
  label: string;
  value: string;
  detail: string;
  tone?: string;
}

function KpiTile({ label, value, detail, tone }: KpiTileProps) {
  return (
    <div className="flex flex-col rounded-lg bg-surface-container-low p-space-sm">
      <span className="font-label-sm text-label-sm text-on-surface-variant">{label}</span>
      <span className={`font-mono text-metric-md font-semibold ${tone ?? 'text-on-surface'}`}>{value}</span>
      <span className="font-label-sm text-label-sm text-on-surface-variant">{detail}</span>
    </div>
  );
}

export function IncidentDossier({ incident, tenantId, dataVersion, onBack, onInspectDevice }: IncidentDossierProps) {
  const [copied, setCopied] = useState<string | null>(null);

  const sortedEvents = useMemo(
    () => [...incident.anomalies].sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()),
    [incident],
  );
  const triggerEvent = useMemo(() => pickTriggerEvent(incident.anomalies), [incident]);
  const startMs = new Date(sortedEvents[0].timestamp).getTime();
  const otherMetrics = incident.metrics.filter((metric) => metric !== triggerEvent.metric);

  /**
   * Real per-metric series fetched for this incident's device: the trigger metric's own recent
   * history (for its z-score and the waveform sparkline) plus every other metric present in the
   * incident (for real Pearson correlation against the trigger series). Nothing here is invented —
   * a metric with too little history simply drops out of the graph instead of getting a fake edge.
   */
  const seriesState = useAsyncData(
    async (signal) => {
      const metrics = [triggerEvent.metric, ...otherMetrics];
      const results = await Promise.all(
        metrics.map(async (metric) => {
          try {
            const series = await fetchSeries(
              { tenantId: tenantId || undefined, deviceId: incident.deviceId, metric, limit: CORRELATION_POINTS },
              signal,
            );
            return [metric, series] as const;
          } catch {
            return [metric, null] as const;
          }
        }),
      );
      return new Map(results);
    },
    [tenantId, incident.deviceId, triggerEvent.metric, otherMetrics.join(','), dataVersion],
  );

  const triggerSeries = seriesState.data?.get(triggerEvent.metric) ?? null;
  const triggerValues = triggerSeries?.points.map((point) => Number(point.value)) ?? [];

  /*
   * Devices other than this one that were also flagged around the same time. With a single metric type
   * recorded platform-wide there is nothing to correlate across metrics, so the question that actually
   * has an answer here is which *other nodes* moved with this one.
   */
  const neighboursState = useAsyncData(
    async (signal) => {
      const window = 30 * 60 * 1000;
      const page = await fetchAnomalies(
        {
          tenantId: tenantId || undefined,
          metric: triggerEvent.metric,
          from: new Date(new Date(incident.start).getTime() - window).toISOString(),
          to: new Date(new Date(incident.end).getTime() + window).toISOString(),
          size: 200,
          sort: 'timestamp',
          direction: 'desc',
        },
        signal,
      );

      const deviceIds = [...new Set(page.content.map((row) => row.deviceId))]
        .filter((id) => id !== incident.deviceId)
        .slice(0, 4);

      const series = await Promise.all(
        deviceIds.map(async (deviceId) => {
          try {
            const result = await fetchSeries(
              { tenantId: tenantId || undefined, deviceId, metric: triggerEvent.metric, limit: CORRELATION_POINTS },
              signal,
            );
            return { deviceId, points: result.points.map((point) => ({ timestamp: point.timestamp, value: Number(point.value) })) };
          } catch {
            return { deviceId, points: [] as { timestamp: string; value: number }[] };
          }
        }),
      );
      return series.filter((entry) => entry.points.length >= 4);
    },
    [tenantId, incident.deviceId, incident.start, incident.end, triggerEvent.metric, dataVersion],
  );

  /** Live topic facts for the payload inspector — real names and partition counts, no per-event coordinates. */
  const topologyState = useAsyncData((signal) => fetchKafkaTopology(signal), [dataVersion]);
  const anomalyTopic = topologyState.data?.topics.find((topic) => topic.name.endsWith('anomalies')) ?? null;

  const zScore =
    triggerValues.length >= 3
      ? zScoreAgainstHistory(triggerEvent.value, triggerValues.slice(0, -1).length > 0 ? triggerValues.slice(0, -1) : triggerValues)
      : 0;
  const hasZScore = triggerValues.length >= 3;

  /*
   * Edges are real Pearson coefficients against the trigger series: other metrics on this device when
   * more than one was flagged, and otherwise the neighbouring devices reporting the same measurement.
   * Either way an edge is co-movement that was measured, never an inferred cause.
   */
  const edges = useMemo<CausalEdge[]>(() => {
    if (!triggerSeries || triggerSeries.points.length < 4) return [];
    const triggerGrid = resampleUniform(triggerSeries.points, CORRELATION_GRID);

    const metricEdges = otherMetrics.flatMap((metric) => {
      const series = seriesState.data?.get(metric);
      if (!series || series.points.length < 4) return [];
      const grid = resampleUniform(series.points, CORRELATION_GRID);
      return [{ from: triggerEvent.metric, to: metric, strength: Math.abs(pearsonCorrelation(triggerGrid, grid)) }];
    });
    if (metricEdges.length > 0) {
      return metricEdges;
    }

    return (neighboursState.data ?? []).map((neighbour) => ({
      from: incident.deviceId,
      to: neighbour.deviceId,
      strength: Math.abs(pearsonCorrelation(triggerGrid, resampleUniform(neighbour.points, CORRELATION_GRID))),
    }));
  }, [triggerSeries, seriesState.data, otherMetrics, triggerEvent.metric, neighboursState.data, incident.deviceId]);

  const correlatingAcrossDevices = edges.length > 0 && edges[0].from === incident.deviceId;

  const nodes = useMemo<CausalNode[]>(() => {
    const direction = triggerEvent.value > triggerEvent.threshold ? 'above' : 'below';
    const root: CausalNode = {
      id: correlatingAcrossDevices ? incident.deviceId : triggerEvent.metric,
      title: 'Trigger reading',
      metric: correlatingAcrossDevices ? incident.deviceId : humanizeLabel(triggerEvent.metric),
      detail: `${direction} ${formatMeasurement(triggerEvent.threshold)} threshold`,
      role: 'root',
    };
    const leaves: CausalNode[] = edges.map((edge) => ({
      id: edge.to,
      title: correlatingAcrossDevices ? 'Neighbouring node' : 'Correlated metric',
      metric: correlatingAcrossDevices ? edge.to : humanizeLabel(edge.to),
      detail: `|r| = ${edge.strength.toFixed(2)}`,
      role: 'correlated' as const,
    }));
    return [root, ...leaves];
  }, [triggerEvent, edges, correlatingAcrossDevices, incident.deviceId]);

  const strongestEdge = edges.reduce<CausalEdge | null>(
    (best, edge) => (!best || edge.strength > best.strength ? edge : best),
    null,
  );

  const detectionLatencyMs = new Date(triggerEvent.ingestedAt).getTime() - new Date(triggerEvent.timestamp).getTime();
  const tone = SEVERITY_TONE[incident.maxSeverityRank];
  const isActive = Date.now() - new Date(incident.end).getTime() < RESOLVED_AFTER_MS;

  const copyJson = (label: string, value: unknown) => {
    navigator.clipboard.writeText(JSON.stringify(value, null, 2)).then(() => {
      setCopied(label);
      window.setTimeout(() => setCopied(null), 2000);
    });
  };

  return (
    <div className="flex flex-col gap-space-lg">
      <section className="flex flex-col justify-between gap-space-md rounded-xl bg-surface-container-lowest p-space-lg shadow-sm lg:flex-row lg:items-start">
        <div className="flex flex-col gap-space-2xs">
          <button
            type="button"
            onClick={onBack}
            className="flex w-fit items-center gap-space-2xs font-label-sm text-label-sm uppercase tracking-wider text-on-surface-variant hover:text-on-surface"
          >
            <span className="material-symbols-outlined text-[16px]" aria-hidden="true">arrow_back</span>
            HyperGuard
            <span className="material-symbols-outlined text-[14px]" aria-hidden="true">chevron_right</span>
            Intelligence
            <span className="material-symbols-outlined text-[14px]" aria-hidden="true">chevron_right</span>
            <span className="font-medium text-primary">Incident Forensics</span>
          </button>
          <div className="flex flex-wrap items-center gap-space-sm">
            <h1 className="text-display-lg font-semibold tracking-tight text-on-surface">
              {humanizeLabel(triggerEvent.metric)} anomaly on {incident.deviceId}
            </h1>
            <span
              className={`inline-flex items-center rounded-full px-space-sm py-0.5 font-label-sm text-label-sm font-semibold uppercase ${
                isActive ? 'bg-error-container text-on-error-container' : 'bg-surface-container text-on-surface-variant'
              }`}
            >
              {isActive ? 'Live triage' : 'Historical'}
            </span>
          </div>
          <p className="max-w-3xl text-body-sm text-on-surface-variant">
            Root-cause working surface for one grouped incident: what was measured, when each reading landed, what
            moved alongside it, and the record exactly as stored.
          </p>
        </div>

        <button
          type="button"
          onClick={onBack}
          className="flex h-10 flex-none items-center gap-space-2xs rounded-lg bg-surface-container-low px-space-md font-label-md text-label-md font-semibold text-on-surface hover:bg-surface-container"
        >
          <span className="material-symbols-outlined text-[18px]" aria-hidden="true">list</span>
          All incidents
        </button>
      </section>

      {/* Incident dossier banner */}
      <div className="flex flex-col gap-space-lg rounded-xl border border-surface-container-high bg-surface-container-lowest p-space-lg shadow-sm lg:flex-row">
        <div className="flex flex-1 flex-col gap-space-md">
          <div className="flex flex-col gap-space-2xs">
            <div className="flex flex-wrap items-center gap-space-sm">
              <span className="rounded bg-surface-container-high px-space-xs py-0.5 font-mono text-code-sm font-semibold text-on-surface">
                {incident.id}
              </span>
              <span className={`inline-flex items-center gap-1 rounded-full px-space-sm py-0.5 font-label-sm text-label-sm font-semibold ${tone.badge}`}>
                {tone.label}
                {hasZScore ? ` (${zScore >= 0 ? '+' : ''}${zScore.toFixed(2)}σ)` : ''}
              </span>
              <span className="font-label-sm text-label-sm text-on-surface-variant">
                Device: {incident.deviceId} {tenantId ? `· Tenant: ${tenantId}` : ''}
              </span>
            </div>
            <p className="max-w-2xl font-body-sm text-body-sm text-on-surface-variant">
              {incident.anomalies.length} flagged reading{incident.anomalies.length === 1 ? '' : 's'} across{' '}
              {incident.metrics.length} metric{incident.metrics.length === 1 ? '' : 's'}, grouped because they hit
              the same device within 15 minutes of each other. Trigger reading:{' '}
              {humanizeLabel(triggerEvent.metric)} at {formatMeasurement(triggerEvent.value)}, threshold{' '}
              {formatMeasurement(triggerEvent.threshold)}.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-space-md sm:grid-cols-4">
            <KpiTile
              label="Detection Latency"
              value={`${Math.max(0, detectionLatencyMs).toLocaleString()} ms`}
              detail="ingested − recorded"
            />
            <KpiTile
              label="Strongest Correlation"
              value={strongestEdge ? `${(strongestEdge.strength * 100).toFixed(1)}%` : '—'}
              detail={strongestEdge ? humanizeLabel(strongestEdge.to) : 'Single metric incident'}
              tone={strongestEdge && strongestEdge.strength >= 0.7 ? 'text-error' : undefined}
            />
            <KpiTile
              label="Impacted Metrics"
              value={String(incident.metrics.length)}
              detail={`${incident.anomalies.length} flagged reading${incident.anomalies.length === 1 ? '' : 's'}`}
            />
            <KpiTile label="Asset Condition" value={tone.label} detail={`${incident.deviceId}`} tone={tone.text} />
          </div>
        </div>

        <div className="flex w-full flex-col gap-space-sm rounded-lg bg-surface-container-low p-space-md lg:w-80">
          <div className="flex items-center justify-between">
            <span className="font-label-sm text-label-sm font-semibold uppercase tracking-wider text-on-surface-variant">
              Trigger metric waveform
            </span>
          </div>
          {triggerValues.length >= 2 ? (
            <div className="flex h-28 w-full items-center justify-center">
              <Sparkline values={triggerValues} width={280} height={100} label={`${triggerEvent.metric} recent history`} />
            </div>
          ) : (
            <p className="font-body-sm text-body-sm text-on-surface-variant">
              Not enough prior history for this metric to draw a trace.
            </p>
          )}
          <div className="flex justify-between font-mono text-code-sm text-on-surface-variant">
            <span>{triggerSeries ? `${triggerSeries.points.length} pts` : '—'}</span>
            <span className={tone.text}>{formatInstant(triggerEvent.timestamp)}</span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-space-lg lg:grid-cols-12">
        {/* Causal correlation graph */}
        <div className="flex flex-col gap-space-md rounded-xl border border-surface-container-high bg-surface-container-lowest p-space-lg shadow-sm lg:col-span-7">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-space-xs">
              <span className="material-symbols-outlined text-[20px] text-primary" aria-hidden="true">
                account_tree
              </span>
              <h3 className="font-headline-sm text-headline-sm text-on-surface">Cross-Metric Correlation Graph</h3>
            </div>
            <span className="rounded bg-surface-container-low px-space-xs py-0.5 font-label-sm text-label-sm text-on-surface-variant">
              Real Pearson r, not a trained model
            </span>
          </div>
          <p className="-mt-space-xs font-body-sm text-body-sm text-on-surface-variant">
            {correlatingAcrossDevices
              ? `Each edge is the real Pearson coefficient between this device's ${humanizeLabel(triggerEvent.metric).toLowerCase()} series and a neighbouring node flagged around the same time. Only one measurement type is recorded platform-wide, so the answerable question is which other nodes moved with this one.`
              : "Each edge is the real correlation coefficient between the trigger metric's series and another metric flagged in this incident."}{' '}
            Correlation shows they moved together — it is not proof one caused the other.
          </p>
          {nodes.length > 1 ? (
            <>
              <div className="rounded-lg bg-surface-container-low p-space-md">
                <CausalGraph nodes={nodes} edges={edges} />
              </div>
              <div className="grid grid-cols-1 gap-space-sm sm:grid-cols-3">
                <KpiTile
                  label="Strongest link"
                  value={strongestEdge ? strongestEdge.strength.toFixed(3) : '—'}
                  detail={strongestEdge ? `|r| with ${strongestEdge.to}` : 'none computed'}
                  tone={strongestEdge && strongestEdge.strength >= 0.7 ? 'text-error' : undefined}
                />
                <KpiTile
                  label="Compared against"
                  value={String(edges.length)}
                  detail={correlatingAcrossDevices ? 'neighbouring nodes' : 'other flagged metrics'}
                />
                <KpiTile
                  label="Method"
                  value="Pearson r"
                  detail={`${CORRELATION_GRID}-point shared grid`}
                />
              </div>
            </>
          ) : (
            <div className="rounded-lg bg-surface-container-low p-space-lg text-center">
              <p className="font-body-sm text-body-sm text-on-surface-variant">
                {neighboursState.loading
                  ? 'Looking for neighbouring nodes flagged around the same time…'
                  : 'No other metric or neighbouring node has enough recorded history in this window to correlate against.'}
              </p>
            </div>
          )}
        </div>

        {/* Microsecond event timeline */}
        <div className="flex flex-col gap-space-md rounded-xl border border-surface-container-high bg-surface-container-lowest p-space-lg shadow-sm lg:col-span-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-space-xs">
              <span className="material-symbols-outlined text-[20px] text-primary" aria-hidden="true">
                history_toggle_off
              </span>
              <h3 className="font-headline-sm text-headline-sm text-on-surface">Millisecond Event Timeline</h3>
            </div>
          </div>
          <div className="flex flex-col gap-space-sm">
            {sortedEvents.map((event) => {
              const offsetMs = new Date(event.timestamp).getTime() - startMs;
              const deltaToTriggerMs =
                new Date(event.timestamp).getTime() - new Date(triggerEvent.timestamp).getTime();
              const direction = event.value > event.threshold ? 'above' : 'below';
              const isTrigger = event.eventId === triggerEvent.eventId;
              return (
                <div
                  key={event.eventId}
                  className={`flex flex-col gap-space-2xs rounded-lg px-space-sm py-space-xs ${
                    isTrigger ? 'bg-error-container/40' : 'bg-surface-container-low'
                  }`}
                >
                  <div className="flex flex-wrap items-center gap-space-sm">
                    <span
                      className={`h-2 w-2 flex-none rounded-full ${isTrigger ? 'bg-error' : 'bg-outline'}`}
                      aria-hidden="true"
                    />
                    <span className="font-mono text-code-sm tabular-nums text-on-surface">
                      {formatInstant(event.timestamp)}
                    </span>
                    {isTrigger ? (
                      <span className="ml-auto rounded bg-error px-space-xs py-0.5 font-label-sm text-label-sm font-semibold uppercase text-on-error">
                        Trigger point
                      </span>
                    ) : (
                      <span className="ml-auto font-mono text-code-sm text-on-surface-variant">
                        Δt {deltaToTriggerMs >= 0 ? '+' : ''}
                        {deltaToTriggerMs.toLocaleString()} ms
                      </span>
                    )}
                  </div>
                  <span className="font-body-sm text-body-sm text-on-surface">
                    {humanizeLabel(event.metric)}: {formatMeasurement(event.value)} — {direction} limit of{' '}
                    {formatMeasurement(event.threshold)} · {humanizeConstant(event.anomalyType)}
                  </span>
                  <span className="font-mono text-code-sm text-on-surface-variant">
                    +{offsetMs.toLocaleString()} ms from first event
                    {anomalyTopic ? ` · topic: ${anomalyTopic.name}` : ''}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-space-lg lg:grid-cols-12">
        {/* Raw event payload inspector */}
        <div className="flex flex-col justify-between gap-space-md rounded-xl border border-surface-container-high bg-surface-container-lowest p-space-lg shadow-sm lg:col-span-7">
          <div className="flex flex-col gap-space-2xs">
            <div className="flex flex-wrap items-center justify-between gap-space-xs">
              <div className="flex items-center gap-space-xs">
                <span className="material-symbols-outlined text-[20px] text-primary" aria-hidden="true">
                  data_object
                </span>
                <h3 className="font-headline-sm text-headline-sm text-on-surface">Raw Anomaly Event</h3>
              </div>
              <button
                type="button"
                className="flex items-center gap-1 font-label-sm text-label-sm text-primary hover:text-on-primary-fixed-variant"
                onClick={() => copyJson('trigger', triggerEvent)}
              >
                <span className="material-symbols-outlined text-[16px]" aria-hidden="true">
                  {copied === 'trigger' ? 'done' : 'content_copy'}
                </span>
                {copied === 'trigger' ? 'Copied!' : 'Copy JSON'}
              </button>
            </div>
            <p className="font-body-sm text-body-sm text-on-surface-variant">
              The exact record this incident's trigger reading was stored as — every field is what the
              query-service returned, nothing added.
            </p>
            {anomalyTopic ? (
              <p className="font-mono text-code-sm text-on-surface-variant">
                Topic: <span className="text-primary">{anomalyTopic.name}</span> · {anomalyTopic.partitionCount}{' '}
                partitions · replication {anomalyTopic.replicationFactor}x · no per-record partition/offset is
                stored, so none is shown
              </p>
            ) : null}
          </div>
          <JsonPreview value={triggerEvent} />
        </div>

        {/* Remediation actions */}
        <div className="flex flex-col justify-between gap-space-md rounded-xl border border-surface-container-high bg-surface-container-lowest p-space-lg shadow-sm lg:col-span-5">
          <div className="flex flex-col gap-space-2xs">
            <div className="flex items-center gap-space-xs">
              <span className="material-symbols-outlined text-[20px] text-primary" aria-hidden="true">
                smart_toy
              </span>
              <h3 className="font-headline-sm text-headline-sm text-on-surface">Response Actions</h3>
            </div>
          </div>

          <div className="flex flex-col gap-space-sm">
            <Button variant="primary" size="large" disabled title="Not wired to a control-plane API in this deployment">
              <span className="material-symbols-outlined text-[20px]" aria-hidden="true">
                gavel
              </span>
              Trigger Automated Quarantine
            </Button>
            <button
              type="button"
              className="flex w-full items-center justify-between rounded-lg bg-surface-container-low p-space-md text-left hover:bg-surface-container"
              onClick={() => onInspectDevice(incident.deviceId)}
            >
              <div className="flex items-center gap-space-sm">
                <span className="material-symbols-outlined text-[20px] text-primary" aria-hidden="true">
                  show_chart
                </span>
                <div className="flex flex-col">
                  <span className="font-body-lg font-semibold text-on-surface">Inspect on Temporal Trends</span>
                  <span className="font-label-sm text-label-sm text-on-surface-variant">
                    Jumps to real spectral &amp; statistical breakdown for {incident.deviceId}
                  </span>
                </div>
              </div>
              <span className="material-symbols-outlined text-on-surface-variant" aria-hidden="true">
                arrow_forward
              </span>
            </button>
            <button
              type="button"
              className="flex w-full items-center justify-between rounded-lg bg-surface-container-low p-space-md text-left hover:bg-surface-container"
              onClick={() => copyJson('incident', incident.anomalies)}
            >
              <div className="flex items-center gap-space-sm">
                <span className="material-symbols-outlined text-[20px] text-primary" aria-hidden="true">
                  troubleshoot
                </span>
                <div className="flex flex-col">
                  <span className="font-body-lg font-semibold text-on-surface">Export Incident Payload</span>
                  <span className="font-label-sm text-label-sm text-on-surface-variant">
                    Copies all {incident.anomalies.length} flagged readings as JSON
                  </span>
                </div>
              </div>
              <span className="material-symbols-outlined text-on-surface-variant" aria-hidden="true">
                {copied === 'incident' ? 'done' : 'file_download'}
              </span>
            </button>
            <Button disabled title="Not wired to a paging system in this deployment">
              <span className="material-symbols-outlined text-[20px]" aria-hidden="true">
                engineering
              </span>
              Dispatch Maintenance Ticket
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
