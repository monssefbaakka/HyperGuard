import { useEffect, useMemo, useRef, useState } from 'react';
import { discreteFourierTransform, harmonicDistortion, type SpectrumBin } from '../lib/signal';

export type WaveType = 'sine' | 'square' | 'triangle' | 'gaussian' | 'brownian';
export type FaultArchetype = 'bearing' | 'thermal' | 'cavitation' | 'dropout' | null;

const POINTS = 160;
const WIDTH = 800;
const HEIGHT = 260;
const MID_Y = HEIGHT / 2;
/** The trace always spans two periods of the fundamental, which is what ties pixels to real time. */
const PERIODS_ON_SCREEN = 2;
const DIVISIONS_X = 8;
const DIVISIONS_Y = 4;
/** Share of dispatches the dropout archetype actually skips — a real gap in the published series. */
const DROPOUT_SHARE = 0.18;

function waveNorm(type: WaveType, phase: number): number {
  switch (type) {
    case 'sine':
      return Math.sin(phase);
    case 'square':
      return Math.sin(phase) >= 0 ? 0.9 : -0.9;
    case 'triangle':
      return (Math.asin(Math.sin(phase)) / (Math.PI / 2)) * 0.95;
    case 'gaussian': {
      const wrap = (phase % (2 * Math.PI)) - Math.PI;
      return Math.exp(-(wrap * wrap) * 3) * 1.8 - 0.5;
    }
    case 'brownian':
      return Math.sin(phase * 0.3) * 0.6 + Math.cos(phase * 1.2) * 0.4;
    default:
      return 0;
  }
}

/** The deviation each archetype adds on top of the base primitive, in normalized units. */
function faultDelta(fault: FaultArchetype, phase: number, progress: number): number {
  switch (fault) {
    case 'bearing':
      return Math.sin(phase * 3) * 0.42 + Math.sin(phase * 5) * 0.18;
    case 'thermal':
      return Math.min(1.6, Math.expm1(progress * 1.2) * 0.6);
    case 'cavitation':
      return Math.sin(phase * 11) * 0.3 * (Math.random() * 0.8 + 0.2);
    case 'dropout':
      return 0;
    default:
      return 0;
  }
}

export interface SynthesizerState {
  waveType: WaveType;
  setWaveType: (wave: WaveType) => void;
  frequency: number;
  setFrequency: (hz: number) => void;
  amplitude: number;
  setAmplitude: (v: number) => void;
  noiseFloorDb: number;
  setNoiseFloorDb: (db: number) => void;
  /** Events actually published per second while the sandbox producer runs. */
  dispatchRate: number;
  setDispatchRate: (eps: number) => void;
  playing: boolean;
  togglePlaying: () => void;
  armedFault: FaultArchetype;
  setArmedFault: (fault: FaultArchetype) => void;
  reset: () => void;

  /** SVG path, in `0 0 800 260` viewBox units, of the generated waveform. */
  wavePath: string;
  /** CH2 — the delta the armed archetype adds, null when nothing is armed. */
  faultPath: string | null;
  /** Root-mean-square and crest factor computed from the real generated sample array. */
  vRms: number;
  crestFactor: number;
  spectrum: SpectrumBin[];
  /** The instantaneous value at the leading edge of the trace, scaled by amplitude. */
  liveSample: number;

  /** Sampling rate the trace implies: {@link POINTS} samples across two periods of the fundamental. */
  sampleRateHz: number;
  nyquistHz: number;
  /** Strongest bin of the real DFT, converted from the transform's cycles-per-hour to Hz. */
  fundamentalHz: number | null;
  /** Total harmonic distortion of the generated signal, as a fraction. */
  thd: number | null;
  msPerDivision: number;
  voltsPerDivision: number;
  /** Fraction of dispatches the armed archetype drops; 0 unless the dropout archetype is armed. */
  dropoutShare: number;
}

const DEFAULTS = {
  waveType: 'sine' as WaveType,
  frequency: 60,
  amplitude: 4.8,
  noiseFloorDb: 38,
  dispatchRate: 5,
};

/**
 * Drives the Simulation Bench. The waveform is generated locally, but it is not decorative: the
 * sample at the leading edge is the value the page publishes into the real ingestion pipeline, and
 * everything reported about it (RMS, crest factor, spectrum, THD, timebase) is computed from the
 * generated array with the same formulas the console runs on live telemetry.
 */
export function useSignalSynthesizer(): SynthesizerState {
  const [waveType, setWaveType] = useState<WaveType>(DEFAULTS.waveType);
  const [frequency, setFrequency] = useState(DEFAULTS.frequency);
  const [amplitude, setAmplitude] = useState(DEFAULTS.amplitude);
  const [noiseFloorDb, setNoiseFloorDb] = useState(DEFAULTS.noiseFloorDb);
  const [dispatchRate, setDispatchRate] = useState(DEFAULTS.dispatchRate);
  const [playing, setPlaying] = useState(true);
  const [armedFault, setArmedFault] = useState<FaultArchetype>(null);
  const [, forceTick] = useState(0);

  const timeRef = useRef(0);
  const rafRef = useRef<number>();

  useEffect(() => {
    const step = () => {
      if (playing) {
        timeRef.current += 0.05 * (frequency / 60);
        forceTick((n) => (n + 1) % 1_000_000);
      }
      rafRef.current = requestAnimationFrame(step);
    };
    rafRef.current = requestAnimationFrame(step);
    return () => {
      if (rafRef.current !== undefined) cancelAnimationFrame(rafRef.current);
    };
  }, [playing, frequency]);

  const sampleRateHz = (POINTS * frequency) / PERIODS_ON_SCREEN;

  const generated = useMemo(() => {
    const t = timeRef.current;
    const noiseScale = (80 - noiseFloorDb) / 40;
    const verticalScale = (amplitude / 5.0) * 80;
    const normValues: number[] = [];
    const pixelPoints: string[] = [];
    const faultPixelPoints: string[] = [];

    for (let i = 0; i <= POINTS; i += 1) {
      const x = (i / POINTS) * WIDTH;
      const progress = i / POINTS;
      const phase = progress * PERIODS_ON_SCREEN * 2 * Math.PI + t;
      let norm = waveNorm(waveType, phase);
      norm += (Math.random() - 0.5) * noiseScale * 0.18;
      // The dropout archetype clamps the transducer to zero for the share of samples it loses, which
      // is the same share the dispatcher actually refuses to publish.
      if (armedFault === 'dropout' && Math.random() < DROPOUT_SHARE) {
        norm = 0;
      }

      const y = MID_Y - norm * verticalScale;
      pixelPoints.push(`${x.toFixed(1)},${y.toFixed(1)}`);
      normValues.push(norm);

      if (armedFault && armedFault !== 'dropout') {
        const delta = faultDelta(armedFault, phase, progress);
        faultPixelPoints.push(`${x.toFixed(1)},${(y - delta * verticalScale).toFixed(1)}`);
      }
    }

    const rms = Math.sqrt(normValues.reduce((sum, v) => sum + v * v, 0) / normValues.length) * amplitude;
    const peak = Math.max(...normValues.map((v) => Math.abs(v))) * amplitude;
    const crest = rms === 0 ? 0 : peak / rms;

    // Timestamps are spaced at the trace's own sampling interval, so the transform's bins come back
    // in the generator's real frequency scale rather than an arbitrary one.
    const sampleIntervalMs = 1000 / sampleRateHz;
    const base = Date.now();
    const spectrumPoints = normValues.slice(0, 64).map((v, i) => ({
      timestamp: new Date(base + i * sampleIntervalMs).toISOString(),
      value: v * amplitude,
    }));
    const spectrum = discreteFourierTransform(
      spectrumPoints.map((p) => p.value),
      spectrumPoints,
    );

    const strongest = spectrum.reduce<SpectrumBin | null>(
      (best, bin) => (best === null || bin.magnitude > best.magnitude ? bin : best),
      null,
    );

    return {
      wavePath: `M ${pixelPoints.join(' L ')}`,
      faultPath: faultPixelPoints.length > 0 ? `M ${faultPixelPoints.join(' L ')}` : null,
      vRms: rms,
      crestFactor: crest,
      spectrum,
      liveSample: normValues[normValues.length - 1] * amplitude,
      fundamentalHz: strongest ? strongest.cyclesPerHour / 3600 : null,
      thd: harmonicDistortion(spectrum),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [waveType, amplitude, noiseFloorDb, armedFault, sampleRateHz, timeRef.current]);

  return {
    waveType,
    setWaveType,
    frequency,
    setFrequency,
    amplitude,
    setAmplitude,
    noiseFloorDb,
    setNoiseFloorDb,
    dispatchRate,
    setDispatchRate,
    playing,
    togglePlaying: () => setPlaying((p) => !p),
    armedFault,
    setArmedFault,
    reset: () => {
      setWaveType(DEFAULTS.waveType);
      setFrequency(DEFAULTS.frequency);
      setAmplitude(DEFAULTS.amplitude);
      setNoiseFloorDb(DEFAULTS.noiseFloorDb);
      setDispatchRate(DEFAULTS.dispatchRate);
      setArmedFault(null);
      setPlaying(true);
    },
    sampleRateHz,
    nyquistHz: sampleRateHz / 2,
    msPerDivision: ((PERIODS_ON_SCREEN / frequency) * 1000) / DIVISIONS_X,
    voltsPerDivision: amplitude / DIVISIONS_Y,
    dropoutShare: armedFault === 'dropout' ? DROPOUT_SHARE : 0,
    ...generated,
  };
}

export const SCOPE_VIEWBOX = { width: WIDTH, height: HEIGHT, midY: MID_Y };
