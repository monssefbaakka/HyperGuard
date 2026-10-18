import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceDot,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  YAxis,
} from 'recharts';
import type { AnomalyRecord } from '../api/types';
import { zScoreAgainstHistory } from '../lib/signal';
import { CHART_COLORS } from '../theme';
import { formatClock, formatMeasurement, formatRelative, formatValueWithUnit } from './format';

export interface SignalSeries {
  /** Data key for the line — a device id, since one metric is overlaid across devices. */
  metric: string;
  label?: string;
  points: { timestamp: string; value: number }[];
}

const LINE_COLORS = [CHART_COLORS.primary, CHART_COLORS.secondary, CHART_COLORS.tertiary];

interface TelemetryTraceProps {
  series: SignalSeries[];
  /** Real anomalies recorded against these same devices, marked on the trace. */
  breaches: AnomalyRecord[];
  /** The threshold the backend actually used to flag them, if any were flagged. */
  threshold: number | null;
  unit: string | null;
  onInspect: (breach: AnomalyRecord) => void;
}

interface Marker {
  breach: AnomalyRecord;
  rank: number;
  sigma: number;
  color: string;
}

/**
 * The overview's main trace: every plotted point is a real reading, every marked breach is a real
 * recorded anomaly, and the sigma quoted next to a marker is that reading's real z-score against its
 * own device's history. Lines are aligned by recency rank rather than wall clock — these devices do
 * not report on a shared schedule, so a clock axis would collapse the shapes into a spike.
 */
export function TelemetryTrace({ series, breaches, threshold, unit, onInspect }: TelemetryTraceProps) {
  const maxLength = Math.max(0, ...series.map((line) => line.points.length));

  if (maxLength === 0) {
    return (
      <div className="rounded-lg bg-surface-container-low p-space-lg font-body-md text-body-md text-on-surface-variant">
        No recent readings to plot for these devices yet.
      </div>
    );
  }

  const data: Record<string, number>[] = [];
  for (let rank = 0; rank < maxLength; rank += 1) {
    const row: Record<string, number> = { rank: maxLength - 1 - rank };
    for (const line of series) {
      const index = line.points.length - 1 - rank;
      if (index >= 0) {
        row[line.metric] = line.points[index].value;
      }
    }
    data.push(row);
  }
  data.sort((a, b) => a.rank - b.rank);

  // A breach is placed on the rank of the reading closest to it in time on its own device's line, so
  // the marker sits on the curve it belongs to. A breach older than the plotted window is left off
  // entirely rather than pinned to the edge, where it would claim a time it did not happen at.
  const markers: Marker[] = [];
  for (const breach of breaches) {
    const lineIndex = series.findIndex((line) => line.metric === breach.deviceId);
    if (lineIndex < 0) {
      continue;
    }
    const line = series[lineIndex];
    if (line.points.length === 0) {
      continue;
    }
    const breachTime = new Date(breach.timestamp).getTime();
    const windowStart = new Date(line.points[0].timestamp).getTime();
    const windowEnd = new Date(line.points[line.points.length - 1].timestamp).getTime();
    if (breachTime < windowStart || breachTime > windowEnd) {
      continue;
    }
    let closest = 0;
    let bestDelta = Infinity;
    line.points.forEach((point, index) => {
      const delta = Math.abs(new Date(point.timestamp).getTime() - breachTime);
      if (delta < bestDelta) {
        bestDelta = delta;
        closest = index;
      }
    });
    markers.push({
      breach,
      rank: maxLength - 1 - (line.points.length - 1 - closest),
      sigma: zScoreAgainstHistory(breach.value, line.points.map((point) => point.value)),
      color: LINE_COLORS[lineIndex % LINE_COLORS.length],
    });
  }

  // The vertical scale has to cover the threshold line and every marked breach, or recharts would
  // auto-fit to the readings alone and clip them out of sight.
  const plotted = series.flatMap((line) => line.points.map((point) => point.value));
  const spanValues = [...plotted, ...markers.map((marker) => marker.breach.value), ...(threshold != null ? [threshold] : [])];
  const low = Math.min(...spanValues);
  const high = Math.max(...spanValues);
  const pad = (high - low || Math.abs(high) || 1) * 0.12;

  const axisPoints = series.reduce<{ timestamp: string; value: number }[]>(
    (longest, line) => (line.points.length > longest.length ? line.points : longest),
    [],
  );
  const axisLabels = [0, 0.25, 0.5, 0.75, 1]
    .map((fraction) => axisPoints[Math.round(fraction * (axisPoints.length - 1))])
    .filter(Boolean);
  const latestAt = axisPoints[axisPoints.length - 1]?.timestamp;

  return (
    <div className="relative w-full overflow-hidden rounded-lg bg-surface-container-low p-space-md">
      <ResponsiveContainer width="100%" height={340}>
        <LineChart data={data} margin={{ top: 24, right: 112, bottom: 8, left: 8 }}>
          <CartesianGrid stroke={CHART_COLORS.grid} vertical={false} />
          <YAxis hide domain={[low - pad, high + pad]} />
          <Tooltip
            contentStyle={{
              background: CHART_COLORS.surfaceContainerLowest,
              border: `1px solid ${CHART_COLORS.surfaceContainerHigh}`,
              borderRadius: 10,
              color: CHART_COLORS.onSurface,
            }}
            labelFormatter={(value: number) =>
              value === maxLength - 1 ? 'Latest reading' : `${maxLength - 1 - value} readings before latest`
            }
            formatter={(value: number, name: string) => [formatValueWithUnit(value, unit), name]}
          />

          {threshold != null ? (
            <ReferenceLine
              y={threshold}
              stroke={CHART_COLORS.error}
              strokeDasharray="6 4"
              strokeWidth={1.5}
              label={{
                value: `${formatMeasurement(threshold)} THRESHOLD`,
                position: 'right',
                fill: CHART_COLORS.error,
                fontSize: 10,
              }}
            />
          ) : null}

          {latestAt ? (
            <ReferenceLine
              x={maxLength - 1}
              stroke={CHART_COLORS.onSurface}
              strokeDasharray="2 2"
              strokeOpacity={0.5}
              label={{
                value: formatRelative(latestAt),
                position: 'insideBottomRight',
                fill: CHART_COLORS.onSurface,
                fontSize: 10,
              }}
            />
          ) : null}

          {series.map((line, index) => (
            <Line
              key={line.metric}
              type="monotone"
              dataKey={line.metric}
              name={line.label ?? line.metric}
              stroke={LINE_COLORS[index % LINE_COLORS.length]}
              strokeWidth={index === 0 ? 3 : 2.5}
              dot={false}
              isAnimationActive={false}
              connectNulls
            />
          ))}

          {markers.map((marker) => (
            <ReferenceDot
              key={marker.breach.eventId}
              x={marker.rank}
              y={marker.breach.value}
              r={5}
              fill={CHART_COLORS.error}
              stroke="none"
              onClick={() => onInspect(marker.breach)}
              className="cursor-pointer"
              label={{
                value: `${formatMeasurement(marker.breach.value)} (${marker.sigma.toFixed(2)}σ)`,
                position: 'right',
                fill: CHART_COLORS.error,
                fontSize: 11,
                fontWeight: 700,
              }}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>

      <div className="flex items-center justify-between pt-space-xs font-mono text-code-sm text-on-surface-variant">
        {axisLabels.map((point, index) => (
          <span key={point.timestamp} className={index === axisLabels.length - 1 ? 'font-medium text-primary' : ''}>
            {formatClock(point.timestamp)}
            {index === axisLabels.length - 1 ? ' (LATEST)' : ''}
          </span>
        ))}
      </div>
    </div>
  );
}
