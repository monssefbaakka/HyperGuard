import { fetchSeries } from '../api/client';
import { useAsyncData } from './useAsyncData';

export interface AxisReading {
  /** Display label — a metric name for the multi-metric mode, or "metric · lens" in single-metric mode. */
  metric: string;
  /** Standard score (or a scaled equivalent, for the range-position lens) against the device's own history. */
  zScore: number;
  /** zScore mapped onto a 0-100 radial magnitude, clamped, 50 = baseline. */
  magnitude: number;
  latestValue: number | null;
  unit: string | null;
  /** True when there were not enough points to establish a baseline. */
  noBaseline: boolean;
}

const BASELINE_POINTS = 30;
/** Single-metric mode needs a longer history to make five lenses meaningful. */
const LENS_POINTS = 60;
/** How many standard deviations map to the full radius; keeps the chart readable. */
const Z_SPAN = 3.5;
/** A radar needs at least this many axes to read as a shape rather than a line. */
const MIN_AXES_FOR_LENSES = 3;

function toMagnitude(z: number): number {
  const clamped = Math.max(-Z_SPAN, Math.min(Z_SPAN, z));
  return 50 + (clamped / Z_SPAN) * 50;
}

function mean(values: number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function stddev(values: number[], about: number): number {
  return Math.sqrt(values.reduce((sum, value) => sum + (value - about) ** 2, 0) / values.length);
}

/** One axis: how far the latest reading sits from the mean of everything before it. */
function latestDeviationAxis(metric: string, values: number[], unit: string | null): AxisReading {
  if (values.length < 3) {
    return { metric, zScore: 0, magnitude: 50, latestValue: values.at(-1) ?? null, unit, noBaseline: true };
  }
  const latest = values[values.length - 1];
  const history = values.slice(0, -1);
  const m = mean(history);
  const sd = stddev(history, m);
  const z = sd === 0 ? 0 : (latest - m) / sd;
  return { metric, zScore: z, magnitude: toMagnitude(z), latestValue: latest, unit, noBaseline: false };
}

/**
 * When a device only reports one or two distinct measurements, a per-metric radar has nothing to
 * draw. Instead of an empty chart, this looks at that same metric's own history through five real,
 * independently-computed lenses — still nothing simulated, just different questions asked of the
 * same recorded numbers.
 */
function lensAxes(metric: string, values: number[], unit: string | null): AxisReading[] {
  const label = (lens: string) => `${metric} ${lens}`;

  if (values.length < 8) {
    return [latestDeviationAxis(label('latest'), values, unit)];
  }

  const latest = values[values.length - 1];
  const previous = values[values.length - 2];
  const windowSize = Math.min(5, Math.floor(values.length / 2));
  const recent = values.slice(-windowSize);
  const rest = values.slice(0, values.length - windowSize);

  const overallMean = mean(values);
  const overallStd = stddev(values, overallMean) || 1;
  const restMean = mean(rest);
  const restStd = stddev(rest, restMean) || 1;
  const recentMean = mean(recent);
  const recentStd = stddev(recent, recentMean);

  const min = Math.min(...values);
  const max = Math.max(...values);
  const rangePosition = max === min ? 50 : ((latest - min) / (max - min)) * 100;

  const latestZ = (latest - restMean) / restStd;
  const driftZ = (recentMean - restMean) / restStd;
  const volatilityZ = (recentStd - restStd) / restStd;
  const momentumZ = (latest - previous) / overallStd;
  const rangeZ = (rangePosition - 50) / 25;

  return [
    { metric: label('latest'), zScore: latestZ, magnitude: toMagnitude(latestZ), latestValue: latest, unit, noBaseline: false },
    { metric: label('short-term drift'), zScore: driftZ, magnitude: toMagnitude(driftZ), latestValue: latest, unit, noBaseline: false },
    { metric: label('volatility shift'), zScore: volatilityZ, magnitude: toMagnitude(volatilityZ), latestValue: latest, unit, noBaseline: false },
    { metric: label('momentum'), zScore: momentumZ, magnitude: toMagnitude(momentumZ), latestValue: latest, unit, noBaseline: false },
    { metric: label('range position'), zScore: rangeZ, magnitude: rangePosition, latestValue: latest, unit, noBaseline: false },
  ];
}

/**
 * Computes how far a device's readings sit from its own recent history — plain statistics, not a
 * trained model. With three or more distinct measurements, each becomes one axis (its latest
 * z-score). With fewer, the single available metric is examined through five real statistical
 * lenses instead, so the radar still has a shape to draw.
 */
export function useDeviationRadar(
  tenantId: string,
  deviceId: string,
  metrics: string[],
  dataVersion: number,
) {
  const metricsKey = metrics.join(',');

  const state = useAsyncData<AxisReading[]>(
    async (signal) => {
      if (!deviceId || metrics.length === 0) {
        return [];
      }

      if (metrics.length >= MIN_AXES_FOR_LENSES) {
        return Promise.all(
          metrics.map(async (metric) => {
            try {
              const series = await fetchSeries(
                { tenantId: tenantId || undefined, deviceId, metric, limit: BASELINE_POINTS },
                signal,
              );
              return latestDeviationAxis(metric, series.points.map((point) => Number(point.value)), series.unit);
            } catch {
              return { metric, zScore: 0, magnitude: 50, latestValue: null, unit: null, noBaseline: true };
            }
          }),
        );
      }

      // Fewer than three metrics: expand the first into five lenses, and give any second metric
      // its own single latest-deviation axis, capped so the chart never grows past six spokes.
      const [primary, secondary] = metrics;
      const results: AxisReading[] = [];

      try {
        const series = await fetchSeries(
          { tenantId: tenantId || undefined, deviceId, metric: primary, limit: LENS_POINTS },
          signal,
        );
        results.push(...lensAxes(primary, series.points.map((point) => Number(point.value)), series.unit));
      } catch {
        results.push({ metric: primary, zScore: 0, magnitude: 50, latestValue: null, unit: null, noBaseline: true });
      }

      if (secondary) {
        try {
          const series = await fetchSeries(
            { tenantId: tenantId || undefined, deviceId, metric: secondary, limit: BASELINE_POINTS },
            signal,
          );
          results.push(latestDeviationAxis(secondary, series.points.map((point) => Number(point.value)), series.unit));
        } catch {
          results.push({ metric: secondary, zScore: 0, magnitude: 50, latestValue: null, unit: null, noBaseline: true });
        }
      }

      return results.slice(0, 6);
    },
    [tenantId, deviceId, metricsKey, dataVersion],
  );

  const axes = state.data ?? [];
  const scored = axes.filter((axis) => !axis.noBaseline);
  const averageAbsZ = scored.length > 0 ? scored.reduce((sum, axis) => sum + Math.abs(axis.zScore), 0) / scored.length : 0;

  return { ...state, axes, averageAbsZ };
}
