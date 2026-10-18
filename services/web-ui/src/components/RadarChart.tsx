import { humanizeLabel } from './format';

export interface RadarAxis {
  metric: string;
  /** 0-100, 50 = baseline / no deviation. */
  magnitude: number;
  noBaseline: boolean;
}

interface RadarChartProps {
  axes: RadarAxis[];
  size?: number;
  /** Compact mode drops axis labels and rings — used for the small fleet-comparison thumbnails. */
  compact?: boolean;
  color?: string;
}

const RINGS = [20, 40, 60, 80, 100];
/** Extra room around the plot so axis labels (some two words long) never clip against the SVG edge. */
const LABEL_MARGIN = 110;

function pointOn(center: number, radius: number, angle: number): [number, number] {
  return [center + radius * Math.sin(angle), center - radius * Math.cos(angle)];
}

/**
 * A polar (radar) chart with a dashed baseline ring at the 50% mark — the "nothing unusual" line —
 * and a filled polygon tracing each axis's current magnitude. Purely a rendering component: the
 * numbers it draws come from {@link useDeviationRadar}, not from this file.
 */
export function RadarChart({ axes, size = 280, compact = false, color = '#0284c7' }: RadarChartProps) {
  const margin = compact ? 0 : LABEL_MARGIN;
  const canvas = size + margin * 2;
  const center = canvas / 2;
  const radius = compact ? size * 0.38 : size * 0.34;
  const labelRadius = radius + 20;
  const count = axes.length;

  if (count < 3) {
    return (
      <div
        className="flex items-center justify-center font-body-sm text-body-sm text-on-surface-variant"
        style={{ width: size, height: size }}
      >
        Not enough distinct measurements for this device to plot a radar.
      </div>
    );
  }

  const angleStep = (2 * Math.PI) / count;
  const dataPoints = axes.map((axis, index) => pointOn(center, (axis.magnitude / 100) * radius, index * angleStep));
  const dataPath = `M ${dataPoints.map(([x, y]) => `${x},${y}`).join(' L ')} Z`;
  const baselinePoints = axes.map((_, index) => pointOn(center, radius * 0.5, index * angleStep));
  const baselinePath = `M ${baselinePoints.map(([x, y]) => `${x},${y}`).join(' L ')} Z`;

  const hasDeviation = axes.some((axis) => !axis.noBaseline && Math.abs(axis.magnitude - 50) > 20);
  const strokeColor = hasDeviation ? '#ef4444' : color;
  const fillColor = hasDeviation ? '#ef4444' : color;

  return (
    <svg
      width={canvas}
      height={canvas}
      viewBox={`0 0 ${canvas} ${canvas}`}
      role="img"
      aria-label="Deviation radar"
      className="max-w-full"
    >
      {!compact
        ? RINGS.map((pct) => (
            <circle
              key={pct}
              cx={center}
              cy={center}
              r={(pct / 100) * radius}
              fill="none"
              stroke="#e2e8f0"
              strokeWidth={1}
            />
          ))
        : (
            <circle cx={center} cy={center} r={radius} fill="none" stroke="#e2e8f0" strokeWidth={1} />
          )}

      {!compact &&
        axes.map((_, index) => {
          const [x, y] = pointOn(center, radius, index * angleStep);
          return <line key={index} x1={center} y1={center} x2={x} y2={y} stroke="#e2e8f0" strokeWidth={1} />;
        })}

      <path d={baselinePath} fill="none" stroke="#0284c7" strokeDasharray="3 3" strokeWidth={1.25} opacity={0.6} />

      <path d={dataPath} fill={fillColor} fillOpacity={0.16} stroke={strokeColor} strokeWidth={2} strokeLinejoin="round" />

      {dataPoints.map(([x, y], index) => (
        <circle key={index} cx={x} cy={y} r={3} fill={strokeColor} />
      ))}

      {!compact &&
        axes.map((axis, index) => {
          const [x, y] = pointOn(center, labelRadius, index * angleStep);
          const anchor = Math.abs(x - center) < 4 ? 'middle' : x > center ? 'start' : 'end';
          const words = humanizeLabel(axis.metric).split(' ');
          return (
            <text
              key={axis.metric}
              x={x}
              y={y}
              textAnchor={anchor}
              dominantBaseline="middle"
              className="fill-on-surface-variant font-mono"
              fontSize={10}
            >
              {words.map((word, wordIndex) => (
                <tspan key={wordIndex} x={x} dy={wordIndex === 0 ? 0 : 11}>
                  {word}
                </tspan>
              ))}
            </text>
          );
        })}
    </svg>
  );
}
