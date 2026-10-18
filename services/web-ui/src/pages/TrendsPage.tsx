import { useEffect, useMemo, useState } from 'react';
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceDot,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { fetchAnomalies, fetchSeries } from '../api/client';
import type { AnomalyRecord, Facets } from '../api/types';
import { Button, Select, toOptions } from '../components/Controls';
import { EmptyState, ErrorBanner } from '../components/Feedback';
import {
  DEFAULT_TIME_RANGE,
  TimeRangePicker,
  describeTimeRange,
  resolveTimeRange,
  type TimeRange,
} from '../components/TimeRange';
import {
  formatClock,
  formatInstant,
  formatMeasurement,
  formatRelative,
  formatUnit,
  formatValueWithUnit,
  humanizeLabel,
} from '../components/format';
import { useAsyncData } from '../hooks/useAsyncData';
import {
  bestLagCorrelation,
  computeMoments,
  discreteFourierTransform,
  harmonicDistortion,
  linearTrend,
  pearsonCorrelation,
  projectHoursToThreshold,
  resampleUniform,
  rollingMean,
  spearmanCorrelation,
  varianceRatio,
  zScoreAgainstHistory,
} from '../lib/signal';
import { CHART_COLORS } from '../theme';
import type { PageId } from './HomePage';

interface TrendsPageProps {
  tenantId: string;
  facets: Facets | null;
  technical: boolean;
  dataVersion: number;
  /** Device picked from the overview's device list; applied once, then cleared. */
  focusDeviceId: string | null;
  onFocusConsumed: () => void;
  onNavigate: (page: PageId) => void;
}

interface ChartPoint {
  time: number;
  iso: string;
  value: number;
  sma: number | null;
}

/** Rolling-average window, in samples. */
const SMA_WINDOW = 5;
const RESAMPLE_POINTS = 32;
/** Devices compared against the focused one in the correlation table. */
const CORRELATION_DEVICES = 4;
const CORRELATION_GRID = 24;

const BUCKETS = [
  { id: 'raw', label: 'Raw', minutes: 0 },
  { id: '1m', label: '1m', minutes: 1 },
  { id: '5m', label: '5m', minutes: 5 },
  { id: '1h', label: '1h', minutes: 60 },
  { id: '1d', label: '1d', minutes: 1440 },
] as const;

type BucketId = (typeof BUCKETS)[number]['id'];

/** Averages real readings into fixed-width buckets; an empty bucket is omitted, never interpolated. */
function bucketPoints(
  points: { timestamp: string; value: number }[],
  minutes: number,
): { timestamp: string; value: number }[] {
  if (minutes <= 0 || points.length === 0) {
    return points;
  }
  const width = minutes * 60_000;
  const groups = new Map<number, number[]>();
  for (const point of points) {
    const slot = Math.floor(new Date(point.timestamp).getTime() / width) * width;
    const bucket = groups.get(slot) ?? [];
    bucket.push(point.value);
    groups.set(slot, bucket);
  }
  return [...groups.entries()]
    .sort((left, right) => left[0] - right[0])
    .map(([slot, values]) => ({
      timestamp: new Date(slot).toISOString(),
      value: values.reduce((sum, value) => sum + value, 0) / values.length,
    }));
}

function StatTile({
  label,
  value,
  note,
  tone = 'default',
}: {
  label: string;
  value: string;
  note?: string;
  tone?: 'default' | 'critical' | 'good' | 'warn';
}) {
  const valueTone = {
    default: 'text-on-surface',
    critical: 'text-error',
    good: 'text-secondary',
    warn: 'text-tertiary',
  }[tone];
  return (
    <div className="flex flex-col gap-space-2xs rounded-lg bg-surface-container-low p-space-sm">
      <span className="font-label-sm text-label-sm text-on-surface-variant">{label}</span>
      <span className={`font-mono text-metric-md font-semibold tabular-nums ${valueTone}`}>{value}</span>
      {note ? <span className="font-label-sm text-label-sm text-on-surface-variant">{note}</span> : null}
    </div>
  );
}

/**
 * Longitudinal analysis of one device's measurement.
 *
 * <p>Every figure on this screen is computed from the plotted samples: the rolling average, the
 * least-squares trend and its extrapolation, the DFT, the statistical moments and the
 * cross-correlations against sibling devices. The safety envelope is the threshold the backend
 * actually recorded when it flagged this series, falling back to a stated multiple of its own
 * standard deviation when nothing has been flagged yet.
 */
export function TrendsPage({
  tenantId,
  facets,
  technical,
  dataVersion,
  focusDeviceId,
  onFocusConsumed,
  onNavigate,
}: TrendsPageProps) {
  const [deviceId, setDeviceId] = useState('');
  const [metric, setMetric] = useState('');
  const [range, setRange] = useState<TimeRange>(DEFAULT_TIME_RANGE);
  const [bucket, setBucket] = useState<BucketId>('raw');
  const [correlationMethod, setCorrelationMethod] = useState<'pearson' | 'spearman'>('pearson');

  const devices = useMemo(() => facets?.devices ?? [], [facets]);
  const metrics = useMemo(() => facets?.metrics ?? [], [facets]);

  useEffect(() => {
    if (focusDeviceId) {
      setDeviceId(focusDeviceId);
      onFocusConsumed();
    }
  }, [focusDeviceId, onFocusConsumed]);

  useEffect(() => {
    if (focusDeviceId) {
      return;
    }
    if (devices.length > 0 && !devices.includes(deviceId)) {
      setDeviceId(devices[0]);
    }
  }, [devices, deviceId, focusDeviceId]);

  useEffect(() => {
    if (metrics.length > 0 && !metrics.includes(metric)) {
      setMetric(metrics[0]);
    }
  }, [metrics, metric]);

  const ready = Boolean(deviceId && metric);

  const state = useAsyncData(
    (signal) => {
      if (!ready) {
        return Promise.resolve(null);
      }
      const { from, to } = resolveTimeRange(range);
      return fetchSeries({ tenantId: tenantId || undefined, deviceId, metric, from, to }, signal);
    },
    [tenantId, deviceId, metric, range.preset, range.fromInput, range.toInput, ready, dataVersion],
  );

  // Anomalies for this exact series supply the real safety envelope and the breach markers.
  const anomalies = useAsyncData(
    (signal) => {
      if (!ready) {
        return Promise.resolve(null);
      }
      return fetchAnomalies(
        { tenantId: tenantId || undefined, deviceId, metric, size: 100, sort: 'timestamp', direction: 'desc' },
        signal,
      );
    },
    [tenantId, deviceId, metric, ready, dataVersion],
  );

  // Sibling devices reporting the same measurement, for the correlation table.
  const siblings = useMemo(
    () => devices.filter((candidate) => candidate !== deviceId).slice(0, CORRELATION_DEVICES),
    [devices, deviceId],
  );
  const siblingSeries = useAsyncData(
    async (signal) => {
      if (!ready || siblings.length === 0) {
        return [] as { deviceId: string; points: { timestamp: string; value: number }[] }[];
      }
      const { from, to } = resolveTimeRange(range);
      return Promise.all(
        siblings.map(async (candidate) => {
          try {
            const series = await fetchSeries(
              { tenantId: tenantId || undefined, deviceId: candidate, metric, from, to },
              signal,
            );
            return {
              deviceId: candidate,
              points: series.points.map((point) => ({ timestamp: point.timestamp, value: Number(point.value) })),
            };
          } catch {
            return { deviceId: candidate, points: [] };
          }
        }),
      );
    },
    [tenantId, siblings.join(','), metric, range.preset, range.fromInput, range.toInput, ready, dataVersion],
  );

  const rawPoints = useMemo(
    () => (state.data?.points ?? []).map((point) => ({ timestamp: point.timestamp, value: Number(point.value) })),
    [state.data],
  );
  const bucketMinutes = BUCKETS.find((entry) => entry.id === bucket)?.minutes ?? 0;
  const series = useMemo(() => bucketPoints(rawPoints, bucketMinutes), [rawPoints, bucketMinutes]);

  const values = series.map((point) => point.value);
  const sma = useMemo(() => rollingMean(values, SMA_WINDOW), [values.join(',')]);
  const points: ChartPoint[] = series.map((point, index) => ({
    time: new Date(point.timestamp).getTime(),
    iso: point.timestamp,
    value: point.value,
    sma: sma[index],
  }));

  const unit = state.data?.unit ?? '';
  const unitLabel = formatUnit(unit);

  const anomalyRows: AnomalyRecord[] = anomalies.data?.content ?? [];
  const moments = values.length > 1 ? computeMoments(values) : null;

  // The envelope: the backend's own recorded threshold when this series has been flagged, otherwise
  // a stated multiple of its own spread. Which one is in use is spelled out under the chart.
  const recordedThreshold =
    anomalyRows.length > 0
      ? anomalyRows.reduce((sum, row) => sum + row.threshold, 0) / anomalyRows.length
      : null;
  const envelope = recordedThreshold ?? (moments ? moments.mean + 3 * moments.stddev : null);

  const latest = values[values.length - 1] ?? null;
  const trend = useMemo(() => linearTrend(series), [series]);
  const zScore = latest != null && values.length > 1 ? zScoreAgainstHistory(latest, values.slice(0, -1)) : null;
  const hoursToEnvelope =
    trend && latest != null && envelope != null ? projectHoursToThreshold(trend, latest, envelope) : null;
  const breaching = latest != null && envelope != null && latest >= envelope;

  const breachPoints = envelope == null ? [] : points.filter((point) => point.value >= envelope);

  // Scale to the band the readings and the envelope actually occupy; anchoring at zero would flatten
  // a series that only varies over a few degrees.
  const yDomain = useMemo<[number, number]>(() => {
    const span = [...values, ...(envelope != null ? [envelope] : [])];
    if (span.length === 0) {
      return [0, 1];
    }
    const low = Math.min(...span);
    const high = Math.max(...span);
    const pad = (high - low || Math.abs(high) || 1) * 0.12;
    return [low - pad, high + pad];
  }, [values.join(','), envelope]);

  // Spectrum, on a uniform grid because a DFT needs a fixed clock and readings do not arrive on one.
  const spectrum = useMemo(
    () => (series.length >= 8 ? discreteFourierTransform(resampleUniform(series, RESAMPLE_POINTS), series) : []),
    [series],
  );
  const peaks = useMemo(
    () => [...spectrum].sort((left, right) => right.magnitude - left.magnitude).slice(0, 3),
    [spectrum],
  );
  const totalEnergy = spectrum.reduce((sum, bin) => sum + bin.magnitude ** 2, 0);
  const spectralEnergyRatio = totalEnergy > 0 && peaks[0] ? (peaks[0].magnitude ** 2) / totalEnergy : null;
  const thd = spectrum.length > 0 ? harmonicDistortion(spectrum) : null;
  const nyquistCyclesPerHour = spectrum.length > 0 ? spectrum[spectrum.length - 1].cyclesPerHour : null;
  const homogeneity = varianceRatio(values);

  const correlations = useMemo(() => {
    if (series.length < 6) {
      return [];
    }
    const base = resampleUniform(series, CORRELATION_GRID);
    const spanHours =
      (new Date(series[series.length - 1].timestamp).getTime() - new Date(series[0].timestamp).getTime()) / 3_600_000;
    const stepMinutes = spanHours > 0 ? (spanHours * 60) / (CORRELATION_GRID - 1) : 0;

    return (siblingSeries.data ?? [])
      .filter((entry) => entry.points.length >= 6)
      .map((entry) => {
        const other = resampleUniform(entry.points, CORRELATION_GRID);
        const coefficient =
          correlationMethod === 'pearson' ? pearsonCorrelation(base, other) : spearmanCorrelation(base, other);
        const lagged = bestLagCorrelation(base, other, 6);
        return {
          deviceId: entry.deviceId,
          coefficient,
          lagMinutes: lagged.lag * stepMinutes,
          laggedCoefficient: lagged.coefficient,
        };
      })
      .sort((left, right) => Math.abs(right.coefficient) - Math.abs(left.coefficient));
  }, [series, siblingSeries.data, correlationMethod]);

  const exportCsv = () => {
    const header = 'timestamp,value,unit,rolling_mean\n';
    const body = points
      .map((point) => `${point.iso},${point.value},${unit},${point.sma ?? ''}`)
      .join('\n');
    const url = URL.createObjectURL(new Blob([header + body], { type: 'text/csv' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `${deviceId}-${metric}-${Date.now()}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const metricHasAnomalies = (candidate: string) =>
    candidate === metric && anomalyRows.length > 0;

  return (
    <div className="flex flex-col gap-space-xl">
      {/* Header */}
      <section className="flex flex-col justify-between gap-space-md rounded-xl bg-surface-container-lowest p-space-lg shadow-sm lg:flex-row lg:items-start">
        <div className="flex flex-col gap-space-2xs">
          <div className="flex items-center gap-space-2xs font-label-sm text-label-sm uppercase tracking-wider text-on-surface-variant">
            <span>HyperGuard</span>
            <span className="material-symbols-outlined text-[14px]" aria-hidden="true">chevron_right</span>
            <span>Analytics</span>
            <span className="material-symbols-outlined text-[14px]" aria-hidden="true">chevron_right</span>
            <span className="font-medium text-primary">Temporal Trends</span>
          </div>
          <h1 className="max-w-2xl text-display-lg font-semibold tracking-tight text-on-surface">
            Longitudinal Sensor Trends &amp; Drift Analysis
          </h1>
          <p className="max-w-2xl text-body-sm text-on-surface-variant">
            Time-series regression comparing a rolling baseline against the recorded safety envelope, across{' '}
            {devices.length} reporting device{devices.length === 1 ? '' : 's'}.
          </p>
        </div>

        <div className="flex flex-col items-start gap-space-sm lg:items-end">
          <div className="flex items-center rounded-lg bg-surface-container-low p-space-2xs">
            {BUCKETS.map((entry) => (
              <button
                key={entry.id}
                type="button"
                aria-pressed={bucket === entry.id}
                className={`rounded-md px-space-sm py-space-2xs font-label-md text-label-md ${
                  bucket === entry.id
                    ? 'bg-surface-container-lowest font-semibold text-primary shadow-sm'
                    : 'text-on-surface-variant hover:text-on-surface'
                }`}
                onClick={() => setBucket(entry.id)}
              >
                {entry.label}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-space-sm">
            <Select value={deviceId} options={toOptions(devices)} onChange={setDeviceId} disabled={devices.length === 0} />
            <button
              type="button"
              className="flex h-10 items-center gap-space-2xs rounded-lg bg-surface-container-low px-space-md font-label-md text-label-md font-semibold text-on-surface hover:bg-surface-container"
              onClick={exportCsv}
              disabled={points.length === 0}
            >
              <span className="material-symbols-outlined text-[18px]" aria-hidden="true">download</span>
              Export CSV
            </button>
          </div>
        </div>
      </section>

      {/* Measurement tabs — the real metric list this deployment records */}
      {metrics.length > 0 ? (
        <div className="flex flex-wrap gap-space-xs">
          {metrics.map((candidate) => (
            <button
              key={candidate}
              type="button"
              aria-pressed={metric === candidate}
              className={`flex items-center gap-space-2xs rounded-lg px-space-md py-space-xs font-label-md text-label-md font-semibold transition-colors ${
                metric === candidate
                  ? 'bg-primary text-on-primary shadow-sm'
                  : 'bg-surface-container-lowest text-on-surface-variant hover:text-on-surface'
              }`}
              onClick={() => setMetric(candidate)}
            >
              <span className="material-symbols-outlined text-[16px]" aria-hidden="true">timeline</span>
              {humanizeLabel(candidate)}
              {metricHasAnomalies(candidate) ? (
                <span
                  className={`rounded px-space-2xs py-0.5 font-label-sm text-label-sm ${
                    metric === candidate ? 'bg-on-primary/20 text-on-primary' : 'bg-error-container text-on-error-container'
                  }`}
                >
                  {anomalyRows.length} flagged
                </span>
              ) : null}
            </button>
          ))}
        </div>
      ) : null}

      <TimeRangePicker value={range} onChange={setRange} />

      <ErrorBanner error={state.error} onRetry={state.reload} />

      {/* Breach banner, shown only when the latest real reading is at or above the envelope */}
      {breaching && latest != null && envelope != null ? (
        <section className="flex flex-col gap-space-sm rounded-xl bg-error-container p-space-lg">
          <div className="flex flex-wrap items-center gap-space-sm">
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-error text-on-error">
              <span className="material-symbols-outlined text-[18px]" aria-hidden="true">priority_high</span>
            </span>
            <h2 className="text-headline-sm font-semibold text-on-error-container">
              {humanizeLabel(metric)} above safety envelope — {deviceId}
            </h2>
            <span className="rounded bg-error px-space-xs py-0.5 font-label-sm text-label-sm font-semibold uppercase text-on-error">
              {anomalyRows[0] ? anomalyRows[0].severity : 'Breach'}
            </span>
          </div>
          <p className="max-w-3xl text-body-sm text-on-error-container">
            Latest reading {formatValueWithUnit(latest, unit)}{' '}
            {latest > envelope
              ? `is ${formatMeasurement(latest - envelope)} above the envelope of ${formatValueWithUnit(envelope, unit)}`
              : `has reached the envelope of ${formatValueWithUnit(envelope, unit)}`}
            {zScore != null ? `, ${zScore.toFixed(2)}σ from this series' own mean` : ''}
            {trend
              ? `. Least-squares trend over the plotted window is ${trend.slopePerHour >= 0 ? '+' : ''}${formatMeasurement(trend.slopePerHour)} ${unitLabel || 'units'}/hour (R² ${trend.rSquared.toFixed(2)})`
              : ''}
            .
          </p>
          <div className="flex flex-wrap gap-space-sm">
            <button
              type="button"
              disabled
              title="Not wired to a control-plane API — this platform has no actuation endpoint to call."
              className="h-9 rounded-lg bg-error px-space-md font-label-md text-label-md font-semibold text-on-error disabled:cursor-not-allowed disabled:opacity-45"
            >
              Initiate mitigation
            </button>
            <button
              type="button"
              className="h-9 rounded-lg bg-surface-container-lowest px-space-md font-label-md text-label-md font-semibold text-on-surface shadow-sm hover:bg-surface-container"
              onClick={() => onNavigate('forensics')}
            >
              Open incident forensics
            </button>
          </div>
        </section>
      ) : null}

      {!ready ? (
        <EmptyState
          title="Nothing to chart yet"
          detail="A chart needs a device and a measurement, and neither exists until the first reading arrives."
          icon="◌"
          action={
            <Button variant="primary" onClick={() => onNavigate('send')}>
              Send a test reading
            </Button>
          }
        />
      ) : points.length === 0 && !state.loading && !state.error ? (
        <EmptyState
          title={`No ${humanizeLabel(metric).toLowerCase()} readings for ${deviceId}`}
          detail={`Nothing was recorded in ${describeTimeRange(range)}. Try a longer period, or pick another device.`}
          icon="⌕"
          action={
            <Button variant="primary" onClick={() => setRange(DEFAULT_TIME_RANGE)}>
              Show all time
            </Button>
          }
        />
      ) : (
        <>
          {/* Regression chart and target-node panel */}
          <section className="grid grid-cols-1 gap-space-lg lg:grid-cols-12">
            <div className="flex flex-col gap-space-md rounded-xl bg-surface-container-lowest p-space-lg shadow-sm lg:col-span-8">
              <div className="flex flex-wrap items-start justify-between gap-space-sm">
                <div>
                  <span className="font-label-sm text-label-sm uppercase tracking-wider text-on-surface-variant">
                    Time-series regression
                  </span>
                  <h2 className="text-headline-md font-semibold text-on-surface">
                    {humanizeLabel(metric)} vs. safety envelope
                  </h2>
                </div>
                <div className="flex flex-wrap items-center gap-space-md font-label-sm text-label-sm">
                  <span className="flex items-center gap-space-2xs text-on-surface-variant">
                    <span className="h-0.5 w-4 rounded-full bg-primary" aria-hidden="true" />
                    Reading
                  </span>
                  <span className="flex items-center gap-space-2xs text-on-surface-variant">
                    <span className="h-0.5 w-4 rounded-full bg-on-surface" aria-hidden="true" />
                    {SMA_WINDOW}-sample rolling mean
                  </span>
                  {envelope != null ? (
                    <span className="flex items-center gap-space-2xs text-error">
                      <span className="h-0.5 w-4 rounded-full bg-error" aria-hidden="true" />
                      Envelope ({formatMeasurement(envelope)})
                    </span>
                  ) : null}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-space-sm lg:grid-cols-4">
                <StatTile
                  label="Instantaneous reading"
                  value={latest != null ? formatValueWithUnit(latest, unit) : '—'}
                  tone={breaching ? 'critical' : 'default'}
                  note={points.length > 0 ? formatRelative(points[points.length - 1].iso) : undefined}
                />
                <StatTile
                  label="Delta to envelope"
                  value={
                    latest != null && envelope != null
                      ? `${latest - envelope >= 0 ? '+' : ''}${formatMeasurement(latest - envelope)}`
                      : '—'
                  }
                  tone={breaching ? 'critical' : 'good'}
                  note={envelope != null ? `envelope ${formatMeasurement(envelope)}` : undefined}
                />
                <StatTile
                  label="Window mean"
                  value={moments ? formatValueWithUnit(moments.mean, unit) : '—'}
                  note={moments ? `σ ${formatMeasurement(moments.stddev)}` : undefined}
                />
                <StatTile
                  label="Trend velocity"
                  value={
                    trend
                      ? `${trend.slopePerHour >= 0 ? '+' : ''}${formatMeasurement(trend.slopePerHour)}`
                      : '—'
                  }
                  tone={trend && trend.slopePerHour > 0 ? 'warn' : 'good'}
                  note={trend ? `${unitLabel || 'units'}/h · R² ${trend.rSquared.toFixed(2)}` : undefined}
                />
              </div>

              <div className="rounded-lg bg-surface-container-low p-2.5 pb-0">
                <ResponsiveContainer width="100%" height={320}>
                  <ComposedChart data={points} margin={{ top: 20, right: 24, bottom: 8, left: 4 }}>
                    <defs>
                      <linearGradient id="trendFill" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={CHART_COLORS.primary} stopOpacity={0.35} />
                        <stop offset="100%" stopColor={CHART_COLORS.primary} stopOpacity={0.02} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid stroke={CHART_COLORS.grid} strokeDasharray="3 3" vertical={false} />
                    <XAxis
                      dataKey="time"
                      type="number"
                      domain={['dataMin', 'dataMax']}
                      scale="time"
                      tickFormatter={(value: number) => formatClock(new Date(value).toISOString())}
                      stroke={CHART_COLORS.outline}
                      tickLine={false}
                      fontSize={12}
                    />
                    <YAxis
                      stroke={CHART_COLORS.outline}
                      tickLine={false}
                      axisLine={false}
                      fontSize={12}
                      width={56}
                      domain={yDomain}
                      tickFormatter={(value: number) => formatMeasurement(value)}
                    />
                    <Tooltip
                      contentStyle={{
                        background: CHART_COLORS.surfaceContainerLowest,
                        border: `1px solid ${CHART_COLORS.surfaceContainerHigh}`,
                        borderRadius: 10,
                        color: CHART_COLORS.onSurface,
                      }}
                      labelFormatter={(value) => formatInstant(new Date(Number(value)).toISOString())}
                      formatter={(value: number, name: string) => [
                        formatValueWithUnit(value, unit),
                        name === 'sma' ? 'Rolling mean' : humanizeLabel(metric),
                      ]}
                    />
                    {envelope != null ? (
                      <ReferenceLine
                        y={envelope}
                        stroke={CHART_COLORS.error}
                        strokeDasharray="6 4"
                        strokeWidth={1.5}
                        label={{
                          value: `ENVELOPE ${formatMeasurement(envelope)}`,
                          position: 'insideTopRight',
                          fill: CHART_COLORS.error,
                          fontSize: 10,
                        }}
                      />
                    ) : null}
                    <Area
                      type="monotone"
                      dataKey="value"
                      stroke={CHART_COLORS.primary}
                      strokeWidth={2}
                      fill="url(#trendFill)"
                      dot={points.length <= 40}
                      isAnimationActive={false}
                    />
                    <Line
                      type="monotone"
                      dataKey="sma"
                      stroke={CHART_COLORS.onSurface}
                      strokeWidth={1.5}
                      strokeDasharray="4 3"
                      dot={false}
                      connectNulls
                      isAnimationActive={false}
                    />
                    {breachPoints.slice(0, 6).map((point) => (
                      <ReferenceDot
                        key={point.iso}
                        x={point.time}
                        y={point.value}
                        r={4}
                        fill={CHART_COLORS.error}
                        stroke="none"
                      />
                    ))}
                  </ComposedChart>
                </ResponsiveContainer>
              </div>

              <p className="font-mono text-code-sm text-on-surface-variant">
                Least-squares linear fit · {points.length} samples
                {bucketMinutes > 0 ? ` · averaged into ${bucketMinutes}m buckets` : ' · raw samples'} ·{' '}
                {recordedThreshold != null
                  ? 'envelope = threshold recorded by the backend when it flagged this series'
                  : 'envelope = window mean + 3σ (nothing flagged yet, so no recorded threshold exists)'}
              </p>
            </div>

            <div className="flex flex-col gap-space-lg lg:col-span-4">
              <div className="flex flex-col gap-space-sm rounded-xl bg-surface-container-lowest p-space-lg shadow-sm">
                <div className="flex items-center justify-between gap-space-xs">
                  <span className="font-label-sm text-label-sm uppercase tracking-wider text-on-surface-variant">
                    Target node telemetry
                  </span>
                  <span className="rounded bg-surface-container px-space-xs py-0.5 font-mono text-code-sm text-on-surface-variant">
                    {deviceId}
                  </span>
                </div>
                <div className="flex items-center gap-space-sm">
                  <span className="flex h-12 w-12 flex-none items-center justify-center rounded-lg bg-surface-container text-primary">
                    <span className="material-symbols-outlined text-[26px]" aria-hidden="true">sensors</span>
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-headline-sm font-semibold text-on-surface">{deviceId}</p>
                    <p className={`flex items-center gap-space-2xs text-body-sm ${breaching ? 'text-error' : 'text-secondary'}`}>
                      <span className="h-2 w-2 rounded-full bg-current" aria-hidden="true" />
                      {breaching ? 'Above envelope' : 'Within envelope'}
                    </p>
                  </div>
                </div>
                <dl className="flex flex-col gap-space-2xs font-mono text-code-sm">
                  {[
                    ['Measurement', `${humanizeLabel(metric)}${unitLabel ? ` (${unitLabel})` : ''}`],
                    ['Samples plotted', String(points.length)],
                    ['Window', describeTimeRange(range)],
                    ['Latest at', points.length > 0 ? formatRelative(points[points.length - 1].iso) : '—'],
                    ['Flagged readings', String(anomalyRows.length)],
                  ].map(([label, value]) => (
                    <div key={label} className="flex justify-between gap-space-sm text-on-surface-variant">
                      <dt>{label}</dt>
                      <dd className="truncate text-right text-on-surface">{value}</dd>
                    </div>
                  ))}
                </dl>
              </div>

              <div className="flex flex-col gap-space-sm rounded-xl bg-surface-container-lowest p-space-lg shadow-sm">
                <div className="flex items-center justify-between gap-space-xs">
                  <span className="font-label-sm text-label-sm uppercase tracking-wider text-on-surface-variant">
                    Trend extrapolation
                  </span>
                  <span className="material-symbols-outlined text-[18px] text-on-surface-variant" aria-hidden="true">
                    timeline
                  </span>
                </div>
                {hoursToEnvelope != null ? (
                  <>
                    <p className="flex items-baseline gap-space-2xs">
                      <span className="font-mono text-metric-xl font-semibold text-error">
                        {hoursToEnvelope < 1 ? (hoursToEnvelope * 60).toFixed(0) : hoursToEnvelope.toFixed(1)}
                      </span>
                      <span className="text-headline-sm text-on-surface">
                        {hoursToEnvelope < 1 ? 'minutes' : 'hours'} to envelope
                      </span>
                    </p>
                    <p className="text-body-sm text-on-surface-variant">
                      Straight-line extension of the least-squares fit over the plotted window. It is a projection of
                      the current trend, not a failure model — this platform records no failures to fit one to.
                    </p>
                  </>
                ) : (
                  <>
                    <p className="font-mono text-metric-xl font-semibold text-secondary">
                      {breaching ? 'Already above' : 'Not converging'}
                    </p>
                    <p className="text-body-sm text-on-surface-variant">
                      {breaching
                        ? 'The latest reading is already at or above the envelope, so there is nothing to project towards.'
                        : 'The fitted trend is flat or falling, so it does not reach the envelope by extrapolation.'}
                    </p>
                  </>
                )}
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-container-high">
                  <div
                    className={`h-1.5 rounded-full ${breaching ? 'bg-error' : 'bg-secondary'}`}
                    style={{
                      width:
                        latest != null && envelope != null && moments
                          ? `${Math.max(4, Math.min(100, ((latest - (moments.mean - 3 * moments.stddev)) / Math.max(1e-9, envelope - (moments.mean - 3 * moments.stddev))) * 100))}%`
                          : '4%',
                    }}
                  />
                </div>
                <dl className="flex justify-between gap-space-sm font-mono text-code-sm text-on-surface-variant">
                  <div>
                    <dt>Fit quality</dt>
                    <dd className="text-on-surface">R² {trend ? trend.rSquared.toFixed(3) : '—'}</dd>
                  </div>
                  <div className="text-right">
                    <dt>Deviation</dt>
                    <dd className="text-on-surface">{zScore != null ? `${zScore.toFixed(2)}σ` : '—'}</dd>
                  </div>
                </dl>
              </div>
            </div>
          </section>

          {/* Spectral density */}
          <section className="flex flex-col gap-space-md rounded-xl bg-surface-container-lowest p-space-lg shadow-sm">
            <div className="flex flex-wrap items-start justify-between gap-space-sm">
              <div>
                <span className="flex items-center gap-space-xs font-label-sm text-label-sm uppercase tracking-wider text-on-surface-variant">
                  Acoustic &amp; kinetic decomposition
                  <span className="rounded bg-primary-container px-space-2xs py-0.5 text-on-primary-container">
                    DFT
                  </span>
                </span>
                <h2 className="text-headline-md font-semibold text-on-surface">Spectral density</h2>
              </div>
              <div className="flex flex-wrap gap-space-md font-label-sm text-label-sm">
                {peaks.map((peak, index) => (
                  <span key={peak.cyclesPerHour} className="flex items-center gap-space-2xs text-on-surface-variant">
                    <span
                      className={`h-2 w-2 rounded-full ${index === 0 ? 'bg-primary' : index === 1 ? 'bg-tertiary' : 'bg-error'}`}
                      aria-hidden="true"
                    />
                    {peak.cyclesPerHour.toFixed(2)} cyc/h
                  </span>
                ))}
              </div>
            </div>

            {spectrum.length === 0 ? (
              <p className="text-body-md text-on-surface-variant">
                At least 8 readings are needed before a transform says anything meaningful.
              </p>
            ) : (
              <>
                <div className="rounded-lg bg-surface-container-low p-2.5 pb-0">
                  <ResponsiveContainer width="100%" height={220}>
                    <ComposedChart data={spectrum} margin={{ top: 20, right: 20, bottom: 4, left: 0 }}>
                      <CartesianGrid stroke={CHART_COLORS.grid} strokeDasharray="3 3" vertical={false} />
                      <XAxis
                        dataKey="cyclesPerHour"
                        type="number"
                        domain={['dataMin', 'dataMax']}
                        tickFormatter={(value: number) => `${value.toFixed(2)}`}
                        stroke={CHART_COLORS.outline}
                        tickLine={false}
                        fontSize={11}
                        label={{
                          value: 'cycles / hour',
                          position: 'insideBottomRight',
                          fill: CHART_COLORS.outline,
                          fontSize: 10,
                        }}
                      />
                      <YAxis stroke={CHART_COLORS.outline} tickLine={false} axisLine={false} fontSize={11} width={44} />
                      <Tooltip
                        contentStyle={{
                          background: CHART_COLORS.surfaceContainerLowest,
                          border: `1px solid ${CHART_COLORS.surfaceContainerHigh}`,
                          borderRadius: 8,
                          color: CHART_COLORS.onSurface,
                          fontFamily: 'JetBrains Mono, monospace',
                          fontSize: 12,
                        }}
                        formatter={(value: number) => [value.toFixed(3), 'Magnitude']}
                        labelFormatter={(value: number) => `${Number(value).toFixed(3)} cycles/hour`}
                      />
                      <Area
                        type="monotone"
                        dataKey="magnitude"
                        stroke={CHART_COLORS.primary}
                        strokeWidth={2}
                        fill="url(#trendFill)"
                        isAnimationActive={false}
                      />
                      {peaks.map((peak, index) => (
                        <ReferenceDot
                          key={peak.cyclesPerHour}
                          x={peak.cyclesPerHour}
                          y={peak.magnitude}
                          r={4}
                          fill={index === 0 ? CHART_COLORS.primary : index === 1 ? CHART_COLORS.tertiary : CHART_COLORS.error}
                          stroke="none"
                          label={{
                            value: `${peak.cyclesPerHour.toFixed(2)}/h`,
                            position: 'top',
                            fill: index === 0 ? CHART_COLORS.primary : index === 1 ? CHART_COLORS.tertiary : CHART_COLORS.error,
                            fontSize: 10,
                            fontWeight: 700,
                          }}
                        />
                      ))}
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>

                <div className="grid grid-cols-1 gap-space-sm sm:grid-cols-3">
                  <StatTile
                    label="Spectral energy ratio"
                    value={spectralEnergyRatio != null ? spectralEnergyRatio.toFixed(3) : '—'}
                    note="strongest component ÷ total energy"
                  />
                  <StatTile
                    label="Out-of-band energy"
                    value={thd != null ? `${(thd * 100).toFixed(1)}%` : '—'}
                    tone={thd != null && thd > 1 ? 'warn' : 'good'}
                    note="rest of the spectrum ÷ strongest component"
                  />
                  <StatTile
                    label="Nyquist limit"
                    value={nyquistCyclesPerHour != null ? `${nyquistCyclesPerHour.toFixed(2)} cyc/h` : '—'}
                    note={`from the real mean sampling interval of ${points.length} samples`}
                  />
                </div>
              </>
            )}
          </section>

          {/* Distribution */}
          <section className="flex flex-col gap-space-md">
            <div>
              <span className="font-label-sm text-label-sm uppercase tracking-wider text-on-surface-variant">
                Higher-order statistical moments
              </span>
              <h2 className="text-headline-md font-semibold text-on-surface">Distribution &amp; kurtosis matrix</h2>
            </div>

            <div className="grid grid-cols-1 gap-space-md sm:grid-cols-2 lg:grid-cols-4">
              {[
                {
                  label: 'Rolling z-score',
                  value: zScore != null ? `${zScore >= 0 ? '+' : ''}${zScore.toFixed(2)}σ` : '—',
                  badge: zScore != null && Math.abs(zScore) >= 3 ? 'BREACH' : 'NOMINAL',
                  critical: zScore != null && Math.abs(zScore) >= 3,
                  detail: 'Distance of the latest reading from this window’s own mean, in standard deviations.',
                },
                {
                  label: 'Excess kurtosis',
                  value: moments ? moments.kurtosis.toFixed(2) : '—',
                  badge: moments ? (moments.kurtosis > 0.3 ? 'LEPTOKURTIC' : moments.kurtosis < -0.3 ? 'PLATYKURTIC' : 'MESOKURTIC') : '—',
                  critical: false,
                  detail: 'Above zero means heavier tails than a normal distribution — occasional sharp spikes rather than steady noise.',
                },
                {
                  label: 'Skewness index',
                  value: moments ? `${moments.skewness >= 0 ? '+' : ''}${moments.skewness.toFixed(2)}` : '—',
                  badge: moments ? (Math.abs(moments.skewness) < 0.2 ? 'SYMMETRIC' : moments.skewness > 0 ? 'RIGHT-SKEWED' : 'LEFT-SKEWED') : '—',
                  critical: false,
                  detail: 'Which side of the mean the readings stretch towards.',
                },
                {
                  label: 'Variance homogeneity',
                  value: homogeneity != null ? homogeneity.toFixed(3) : '—',
                  badge: homogeneity == null ? '—' : homogeneity > 0.5 && homogeneity < 2 ? 'STABLE' : 'SHIFTED',
                  critical: homogeneity != null && (homogeneity <= 0.5 || homogeneity >= 2),
                  detail: 'Second half’s variance divided by the first half’s: near 1 means the noise level itself held steady.',
                },
              ].map((card) => (
                <div key={card.label} className="flex flex-col gap-space-xs rounded-xl bg-surface-container-lowest p-space-lg shadow-sm">
                  <div className="flex items-start justify-between gap-space-xs">
                    <span className="font-label-sm text-label-sm uppercase tracking-wider text-on-surface-variant">
                      {card.label}
                    </span>
                    <span
                      className={`rounded px-space-2xs py-0.5 font-label-sm text-label-sm font-semibold ${
                        card.critical
                          ? 'bg-error-container text-on-error-container'
                          : 'bg-secondary-container text-on-secondary-container'
                      }`}
                    >
                      {card.badge}
                    </span>
                  </div>
                  <span className={`font-mono text-metric-xl font-semibold ${card.critical ? 'text-error' : 'text-on-surface'}`}>
                    {card.value}
                  </span>
                  <p className="text-body-sm text-on-surface-variant">{card.detail}</p>
                </div>
              ))}
            </div>
          </section>

          {/* Cross-correlation */}
          <section className="flex flex-col gap-space-md rounded-xl bg-surface-container-lowest p-space-lg shadow-sm">
            <div className="flex flex-wrap items-start justify-between gap-space-sm">
              <div>
                <span className="font-label-sm text-label-sm uppercase tracking-wider text-on-surface-variant">
                  Covariance &amp; co-movement
                </span>
                <h2 className="text-headline-md font-semibold text-on-surface">Cross-correlation ranking</h2>
              </div>
              <div className="flex items-center rounded-lg bg-surface-container-low p-space-2xs">
                {(['pearson', 'spearman'] as const).map((method) => (
                  <button
                    key={method}
                    type="button"
                    aria-pressed={correlationMethod === method}
                    className={`rounded-md px-space-sm py-space-2xs font-label-md text-label-md capitalize ${
                      correlationMethod === method
                        ? 'bg-surface-container-lowest font-semibold text-primary shadow-sm'
                        : 'text-on-surface-variant hover:text-on-surface'
                    }`}
                    onClick={() => setCorrelationMethod(method)}
                  >
                    {method === 'pearson' ? 'Pearson (r)' : 'Spearman (ρ)'}
                  </button>
                ))}
              </div>
            </div>

            {correlations.length === 0 ? (
              <p className="text-body-md text-on-surface-variant">
                No sibling device has enough readings of {humanizeLabel(metric).toLowerCase()} in this window to
                correlate against.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[620px] border-collapse">
                  <thead>
                    <tr className="border-b border-surface-container-high text-left font-label-sm text-label-sm uppercase tracking-wider text-on-surface-variant">
                      <th className="py-space-xs pr-space-sm font-medium">Correlated channel</th>
                      <th className="py-space-xs pr-space-sm text-right font-medium">
                        {correlationMethod === 'pearson' ? 'Pearson (r)' : 'Spearman (ρ)'}
                      </th>
                      <th className="py-space-xs pr-space-sm font-medium">Best lag</th>
                      <th className="py-space-xs pr-space-sm font-medium">Reading</th>
                      <th className="py-space-xs text-right font-medium">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {correlations.map((entry) => {
                      const strong = Math.abs(entry.coefficient) >= 0.7;
                      const moderate = Math.abs(entry.coefficient) >= 0.4;
                      return (
                        <tr key={entry.deviceId} className="border-b border-surface-container-high/60">
                          <td className="py-space-sm pr-space-sm">
                            <span className="flex items-center gap-space-2xs font-mono text-code-sm text-on-surface">
                              <span
                                className={`h-2 w-2 rounded-full ${strong ? 'bg-error' : moderate ? 'bg-tertiary' : 'bg-outline'}`}
                                aria-hidden="true"
                              />
                              {entry.deviceId} · {humanizeLabel(metric)}
                            </span>
                          </td>
                          <td
                            className={`py-space-sm pr-space-sm text-right font-mono text-code-sm ${
                              strong ? 'text-error' : moderate ? 'text-tertiary' : 'text-on-surface-variant'
                            }`}
                          >
                            {entry.coefficient >= 0 ? '+' : ''}
                            {entry.coefficient.toFixed(3)}
                          </td>
                          <td className="py-space-sm pr-space-sm font-mono text-code-sm text-on-surface-variant">
                            {Math.abs(entry.lagMinutes) < 0.01
                              ? 'aligned'
                              : `${entry.lagMinutes > 0 ? '+' : ''}${entry.lagMinutes.toFixed(1)} min`}
                          </td>
                          <td className="py-space-sm pr-space-sm">
                            <span
                              className={`rounded px-space-2xs py-0.5 font-label-sm text-label-sm ${
                                strong
                                  ? 'bg-error-container text-on-error-container'
                                  : moderate
                                    ? 'bg-tertiary-container text-on-tertiary-container'
                                    : 'bg-surface-container text-on-surface-variant'
                              }`}
                            >
                              {strong ? 'Moves together' : moderate ? 'Partly related' : 'Unrelated'}
                            </span>
                          </td>
                          <td className="py-space-sm text-right">
                            <button
                              type="button"
                              className="font-label-md text-label-md font-semibold text-primary hover:underline"
                              onClick={() => setDeviceId(entry.deviceId)}
                            >
                              Inspect
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            <p className="font-mono text-code-sm text-on-surface-variant">
              Both series resampled onto {CORRELATION_GRID} shared instants before correlating · lag searched over ±6
              steps · correlation is co-movement, not causation.
            </p>
          </section>

          {technical ? (
            <p className="text-body-sm text-on-surface-variant">
              Series read from <code>GET /api/v1/telemetry/series</code> for{' '}
              <code>
                {deviceId}/{metric}
              </code>
              , capped by <code>pulsestream.query.max-series-points</code>.
            </p>
          ) : null}
        </>
      )}
    </div>
  );
}
