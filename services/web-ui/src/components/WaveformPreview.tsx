import type { FaultArchetype, SynthesizerState, WaveType } from '../hooks/useSignalSynthesizer';
import { SCOPE_VIEWBOX } from '../hooks/useSignalSynthesizer';

const WAVE_OPTIONS: { value: WaveType; label: string; icon: string }[] = [
  { value: 'sine', label: 'Sine', icon: '∿' },
  { value: 'square', label: 'Square', icon: '⊓' },
  { value: 'triangle', label: 'Triangle', icon: '△' },
  { value: 'gaussian', label: 'Gaussian', icon: '⋀' },
  { value: 'brownian', label: 'Brownian drift', icon: '〰' },
];

interface SliderFieldProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  unit: string;
  onChange: (value: number) => void;
}

function SliderField({ label, value, min, max, step, unit, onChange }: SliderFieldProps) {
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between">
        <span className="font-label-md text-label-md text-on-surface">{label}</span>
        <div className="flex items-center gap-1">
          <input
            type="number"
            className="w-16 rounded bg-surface-container px-1.5 py-0.5 text-right font-mono text-code-sm text-on-surface focus:outline-none focus:ring-1 focus:ring-primary"
            value={value}
            min={min}
            max={max}
            step={step ?? 1}
            onChange={(event) => onChange(Number(event.target.value))}
          />
          <span className="w-8 font-mono text-code-sm text-on-surface-variant">{unit}</span>
        </div>
      </div>
      <input
        type="range"
        className="h-1.5 w-full cursor-pointer accent-primary"
        value={value}
        min={min}
        max={max}
        step={step ?? 1}
        onChange={(event) => onChange(Number(event.target.value))}
      />
    </div>
  );
}

/** Left-column card: the knobs shaping the signal this page publishes. */
export function SynthesizerControls({ synth }: { synth: SynthesizerState }) {
  return (
    <div className="flex flex-col gap-space-md rounded-xl bg-surface-container-lowest p-space-lg shadow-sm">
      <div className="flex items-start justify-between gap-space-sm">
        <div className="flex items-center gap-space-xs">
          <span className="material-symbols-outlined text-[20px] text-primary" aria-hidden="true">
            graphic_eq
          </span>
          <span className="font-headline-sm text-headline-sm font-semibold text-on-surface">
            Waveform Synthesizer
          </span>
        </div>
        <span className="rounded bg-primary-container px-space-sm py-1 text-right font-mono text-code-sm leading-tight text-on-primary-container">
          CH-01
          <br />
          Primary
        </span>
      </div>

      <div className="flex flex-col gap-space-xs">
        <span className="font-label-sm text-label-sm uppercase tracking-wider text-on-surface-variant">
          Base primitive
        </span>
        <div className="grid grid-cols-3 gap-space-xs">
          {WAVE_OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              className={`flex items-center justify-center gap-1 rounded-lg px-space-2xs py-space-xs font-label-md text-label-md transition-colors ${
                synth.waveType === option.value
                  ? 'bg-primary text-on-primary'
                  : 'bg-surface-container-low text-on-surface hover:bg-surface-container'
              } ${option.value === 'brownian' ? 'col-span-2' : ''}`}
              onClick={() => synth.setWaveType(option.value)}
            >
              <span aria-hidden="true">{option.icon}</span>
              <span>{option.label}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-space-md">
        <SliderField
          label="Frequency (fundamental)"
          value={synth.frequency}
          min={1}
          max={500}
          unit="Hz"
          onChange={synth.setFrequency}
        />
        <SliderField
          label="Amplitude (peak)"
          value={synth.amplitude}
          min={0.1}
          max={24}
          step={0.1}
          unit="pk"
          onChange={synth.setAmplitude}
        />
        <SliderField
          label="Noise floor (SNR)"
          value={synth.noiseFloorDb}
          min={5}
          max={80}
          unit="dB"
          onChange={synth.setNoiseFloorDb}
        />
        <SliderField
          label="Dispatch frequency"
          value={synth.dispatchRate}
          min={1}
          max={20}
          unit="ev/s"
          onChange={synth.setDispatchRate}
        />
      </div>
      <p className="font-body-sm text-body-sm text-on-surface-variant">
        Sampling {Math.round(synth.sampleRateHz)} Hz · Nyquist {Math.round(synth.nyquistHz)} Hz. The dispatch
        frequency is the rate events are really published at while the sandbox producer runs.
      </p>
    </div>
  );
}

const FAULT_PRESETS: {
  fault: Exclude<FaultArchetype, null>;
  label: string;
  detail: string;
  icon: string;
  value: string;
}[] = [
  {
    fault: 'bearing',
    label: 'Sudden bearing seizure',
    detail: 'Harmonic excursion: 3rd +42%, 5th +18%',
    icon: 'settings',
    value: '96.4',
  },
  {
    fault: 'thermal',
    label: 'Thermal runaway loop',
    detail: 'Exponential ΔT slope across the trace',
    icon: 'thermostat',
    value: '118.5',
  },
  {
    fault: 'cavitation',
    label: 'Cavitation cascade',
    detail: 'High-frequency chaotic transients',
    icon: 'water_drop',
    value: '92.0',
  },
  {
    fault: 'dropout',
    label: 'Sensor dropout / packet loss',
    detail: 'Zero-clamp, and 18% of dispatches really skipped',
    icon: 'signal_disconnected',
    value: '0',
  },
];

interface FaultPresetsCardProps {
  synth: SynthesizerState;
  onArm: (value: string, fault: FaultArchetype) => void;
}

/** Scenario packs: each one distorts the generated signal and prefills the value that gets published. */
export function FaultPresetsCard({ synth, onArm }: FaultPresetsCardProps) {
  return (
    <div className="flex flex-col gap-space-sm rounded-xl bg-surface-container-lowest p-space-lg shadow-sm">
      <div className="flex items-start justify-between gap-space-sm">
        <div className="flex items-center gap-space-xs">
          <span className="material-symbols-outlined text-[20px] text-error" aria-hidden="true">
            warning
          </span>
          <span className="font-headline-sm text-headline-sm font-semibold text-on-surface">
            Fault Archetype Injections
          </span>
        </div>
        <span className="text-right font-label-sm text-label-sm leading-tight text-on-surface-variant">
          HIL
          <br />
          profile
        </span>
      </div>
      <p className="font-body-sm text-body-sm text-on-surface-variant">
        Arming a pack reshapes the generated signal and prefills the reading. Events only leave when you
        dispatch or run the producer.
      </p>
      <div className="flex flex-col gap-space-xs">
        {FAULT_PRESETS.map((preset) => (
          <div
            key={preset.fault}
            className="flex items-center justify-between gap-space-sm rounded-lg bg-surface-container-low p-space-sm"
          >
            <div className="flex min-w-0 items-center gap-space-sm">
              <div className="flex h-8 w-8 flex-none items-center justify-center rounded-lg bg-error-container text-on-error-container">
                <span className="material-symbols-outlined text-[18px]" aria-hidden="true">
                  {preset.icon}
                </span>
              </div>
              <div className="flex min-w-0 flex-col">
                <span className="font-body-md font-semibold text-on-surface">{preset.label}</span>
                <span className="font-label-sm text-label-sm text-on-surface-variant">{preset.detail}</span>
              </div>
            </div>
            <button
              type="button"
              className={`flex-none rounded px-space-sm py-1 font-mono text-code-sm transition-colors ${
                synth.armedFault === preset.fault
                  ? 'bg-error text-on-error'
                  : 'bg-surface-container text-on-surface hover:bg-error hover:text-on-error'
              }`}
              onClick={() => onArm(preset.value, preset.fault)}
            >
              {synth.armedFault === preset.fault ? 'Armed' : 'Arm'}
            </button>
          </div>
        ))}
        <div className="flex items-center justify-between gap-space-sm rounded-lg bg-surface-container-low p-space-sm">
          <div className="flex items-center gap-space-sm">
            <div className="flex h-8 w-8 flex-none items-center justify-center rounded-lg bg-secondary-container text-on-secondary-container">
              <span className="material-symbols-outlined text-[18px]" aria-hidden="true">
                check_circle
              </span>
            </div>
            <div className="flex flex-col">
              <span className="font-body-md font-semibold text-on-surface">Nominal</span>
              <span className="font-label-sm text-label-sm text-on-surface-variant">
                Clears the archetype, back to a normal reading
              </span>
            </div>
          </div>
          <button
            type="button"
            className="flex-none rounded bg-surface-container px-space-sm py-1 font-mono text-code-sm text-on-surface hover:bg-secondary hover:text-on-secondary"
            onClick={() => onArm('21.5', null)}
          >
            Arm
          </button>
        </div>
      </div>
    </div>
  );
}

/** The scope panel: a real plot of the samples this page is about to publish. */
export function OscilloscopeDeck({ synth }: { synth: SynthesizerState }) {
  const { width, height } = SCOPE_VIEWBOX;
  return (
    <div className="flex flex-col gap-space-md rounded-xl bg-surface-container-lowest p-space-lg shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-space-sm">
        <div className="flex flex-wrap items-center gap-space-sm">
          <span className="flex items-center gap-1 rounded-full bg-secondary-container px-space-sm py-1 font-label-sm text-label-sm font-semibold text-on-secondary-container">
            <span
              className={`h-2 w-2 rounded-full bg-secondary ${synth.playing ? 'animate-pulse' : ''}`}
              aria-hidden="true"
            />
            SYNTHESIZED OSCILLOSCOPE
          </span>
          <span className="font-mono text-code-sm text-on-surface-variant">
            Timebase: {synth.msPerDivision.toFixed(1)} ms/div · Scale: {synth.voltsPerDivision.toFixed(2)}/div
          </span>
        </div>
        <button
          type="button"
          className="flex h-8 w-8 items-center justify-center rounded bg-surface-container text-on-surface hover:bg-surface-container-high"
          onClick={synth.togglePlaying}
          title={synth.playing ? 'Freeze the trace' : 'Resume the trace'}
        >
          <span className="material-symbols-outlined text-[20px]" aria-hidden="true">
            {synth.playing ? 'pause' : 'play_arrow'}
          </span>
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-space-md font-mono text-code-sm text-on-surface-variant">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-primary" aria-hidden="true" />
          CH1: Transducer ({synth.waveType})
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span
            className={`h-2 w-2 rounded-full ${synth.faultPath ? 'bg-error' : 'bg-outline-variant'}`}
            aria-hidden="true"
          />
          CH2: Fault delta {synth.faultPath ? '' : '(none armed)'}
        </span>
      </div>

      <div className="relative h-64 w-full overflow-hidden rounded-lg bg-surface-container-low shadow-inner sm:h-72">
        <svg className="absolute inset-0 h-full w-full opacity-30" aria-hidden="true">
          <defs>
            <pattern id="scope-grid" width="32" height="32" patternUnits="userSpaceOnUse">
              <path d="M 32 0 L 0 0 0 32" className="stroke-outline-variant" fill="none" strokeWidth="0.75" />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#scope-grid)" />
        </svg>
        <svg
          className="relative z-10 h-full w-full"
          viewBox={`0 0 ${width} ${height}`}
          preserveAspectRatio="none"
          role="img"
          aria-label="Synthesized signal oscilloscope trace"
        >
          <line
            x1={0}
            y1={height / 2}
            x2={width}
            y2={height / 2}
            className="stroke-outline"
            strokeWidth={1}
            strokeDasharray="2 3"
          />
          <path
            d={synth.wavePath}
            fill="none"
            className="stroke-primary"
            strokeWidth={2.5}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          {synth.faultPath ? (
            <path
              d={synth.faultPath}
              fill="none"
              className="stroke-error"
              strokeWidth={2}
              strokeDasharray="4 2"
              strokeLinecap="round"
            />
          ) : null}
        </svg>
        <div className="pointer-events-none absolute left-space-sm top-space-sm flex items-center gap-space-sm font-mono text-code-sm">
          <div className="rounded bg-surface-container-lowest/80 px-space-sm py-1 shadow-sm backdrop-blur">
            <span className="mr-1 text-on-surface-variant">V_RMS:</span>
            <span className="font-semibold text-primary">{synth.vRms.toFixed(2)}</span>
          </div>
          <div className="rounded bg-surface-container-lowest/80 px-space-sm py-1 shadow-sm backdrop-blur">
            <span className="mr-1 text-on-surface-variant">CREST:</span>
            <span className="font-semibold text-secondary">{synth.crestFactor.toFixed(3)}</span>
          </div>
        </div>
        <div className="pointer-events-none absolute bottom-space-sm right-space-sm flex items-center gap-space-sm font-mono text-code-sm">
          {synth.armedFault ? (
            <span className="rounded bg-error-container px-space-sm py-1 font-medium text-on-error-container shadow-sm">
              ARCHETYPE: {synth.armedFault.toUpperCase()} ARMED
            </span>
          ) : null}
          <span className="rounded bg-secondary-container px-space-sm py-1 font-medium text-on-secondary-container shadow-sm">
            TRIGGER: {synth.playing ? 'AUTO' : 'HOLD'} / AC COUPLED
          </span>
        </div>
      </div>

      <div className="flex items-center gap-space-sm">
        <button
          type="button"
          className="flex h-8 w-8 flex-none items-center justify-center rounded bg-surface-container text-on-surface hover:bg-surface-container-high"
          onClick={synth.togglePlaying}
          title={synth.playing ? 'Freeze the trace' : 'Resume the trace'}
        >
          <span className="material-symbols-outlined text-[18px]" aria-hidden="true">
            {synth.playing ? 'pause' : 'play_arrow'}
          </span>
        </button>
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <div className="flex items-center justify-between font-mono text-code-sm text-on-surface-variant">
            <span>−{(synth.msPerDivision * 8).toFixed(1)} ms</span>
            <span>{synth.playing ? 'LIVE T+0.0 ms' : 'HELD'}</span>
            <span>WINDOW {(synth.msPerDivision * 8).toFixed(0)} ms</span>
          </div>
          <div className="h-1.5 w-full rounded-full bg-surface-container">
            <div className={`h-full rounded-full bg-primary ${synth.playing ? 'w-full' : 'w-1/2'}`} />
          </div>
        </div>
      </div>

      <p className="text-center font-mono text-code-sm text-on-surface-variant">
        The trace is the signal being generated here — the leading sample is what gets published.
      </p>
    </div>
  );
}

/** FFT + Lissajous pair, both computed from the same generated sample array as the scope above. */
export function SpectrumAndPhase({ synth }: { synth: SynthesizerState }) {
  const maxMagnitude = Math.max(1e-6, ...synth.spectrum.map((bin) => bin.magnitude));
  const bins = synth.spectrum.slice(0, 16);
  const strongestIndex = bins.reduce(
    (best, bin, index) => (bin.magnitude > bins[best].magnitude ? index : best),
    0,
  );

  // Both axes are driven by the same generator, so the figure's ratio is exactly the cycle ratio used
  // to draw it — reported rather than measured off the pixels.
  const cycles = 2 + (synth.frequency % 5);
  const xyRatio = cycles / (cycles + 1);
  const lissajousSize = 120;
  const r = lissajousSize / 2 - 10;
  const center = lissajousSize / 2;
  const lissajousPath = (() => {
    const points: string[] = [];
    for (let i = 0; i <= 100; i += 1) {
      const t = (i / 100) * Math.PI * 2;
      const x = center + Math.sin(cycles * t) * r;
      const y = center + Math.sin((cycles + 1) * t) * r;
      points.push(`${x.toFixed(1)},${y.toFixed(1)}`);
    }
    return `M ${points.join(' L ')}`;
  })();

  return (
    <div className="grid grid-cols-1 gap-space-lg sm:grid-cols-2">
      <div className="flex flex-col gap-space-xs rounded-xl bg-surface-container-lowest p-space-lg shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-space-xs">
          <div className="flex items-center gap-space-xs">
            <span className="material-symbols-outlined text-[20px] text-primary" aria-hidden="true">
              equalizer
            </span>
            <span className="font-headline-sm text-headline-sm font-semibold text-on-surface">
              Live FFT Spectrum
            </span>
          </div>
          <span className="font-mono text-code-sm text-on-surface-variant">
            0 – {Math.round(synth.nyquistHz)} Hz
          </span>
        </div>
        <p className="font-body-sm text-body-sm text-on-surface-variant">
          Real DFT — the same transform the console runs on live telemetry — over the generated samples.
        </p>
        <div className="relative flex h-28 items-end gap-1 rounded-lg bg-surface-container-low p-space-sm">
          {bins.map((bin, index) => (
            <div
              key={index}
              className={`flex-1 rounded-t ${index === strongestIndex ? 'bg-primary' : 'bg-primary/50'}`}
              style={{ height: `${Math.max(2, (bin.magnitude / maxMagnitude) * 100)}%` }}
              title={`${(bin.cyclesPerHour / 3600).toFixed(1)} Hz`}
            />
          ))}
          <span className="absolute right-space-sm top-space-sm rounded bg-surface-container-lowest/80 px-2 py-0.5 font-mono text-code-sm text-on-surface">
            THD: {synth.thd === null ? '—' : `${(synth.thd * 100).toFixed(2)}%`}
          </span>
        </div>
        <div className="flex items-center justify-between font-mono text-code-sm text-on-surface-variant">
          <span>
            Fundamental ({synth.fundamentalHz === null ? '—' : `${synth.fundamentalHz.toFixed(0)}Hz`})
          </span>
          <span>Nyquist ({Math.round(synth.nyquistHz)}Hz)</span>
        </div>
      </div>

      <div className="flex flex-col gap-space-xs rounded-xl bg-surface-container-lowest p-space-lg shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-space-xs">
          <div className="flex items-center gap-space-xs">
            <span className="material-symbols-outlined text-[20px] text-primary" aria-hidden="true">
              radar
            </span>
            <span className="font-headline-sm text-headline-sm font-semibold text-on-surface">
              Lissajous &amp; Phase
            </span>
          </div>
          <span className="font-mono text-code-sm text-on-surface-variant">Locked Δφ 0.00°</span>
        </div>
        <p className="font-body-sm text-body-sm text-on-surface-variant">
          Both axes are driven by the same generator, so the phase is locked by construction and the figure
          shows the harmonic ratio.
        </p>
        <div className="flex h-28 items-center justify-center rounded-lg bg-surface-container-low">
          <svg
            width={lissajousSize}
            height={lissajousSize}
            viewBox={`0 0 ${lissajousSize} ${lissajousSize}`}
            role="img"
            aria-label="Lissajous figure of the generated signal"
          >
            <circle cx={center} cy={center} r={r} fill="none" className="stroke-outline-variant" strokeWidth={1} />
            <path d={lissajousPath} fill="none" className="stroke-secondary" strokeWidth={1.5} />
          </svg>
        </div>
        <div className="flex items-center justify-between font-mono text-code-sm text-on-surface-variant">
          <span>X/Y ratio: {xyRatio.toFixed(3)}</span>
          <span className="text-on-secondary-container">
            {cycles % 2 === 0 ? 'Symmetric' : 'Odd harmonic'}
          </span>
        </div>
      </div>
    </div>
  );
}
