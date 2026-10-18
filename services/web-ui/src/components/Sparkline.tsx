interface SparklineProps {
  values: number[];
  width?: number;
  height?: number;
  /** Rendered as the accessible description of the shape. */
  label: string;
}

/**
 * A tiny inline trend line.
 *
 * <p>Hand-drawn as an SVG path rather than a chart component: there is one of these per device row,
 * and a full charting library per row would cost far more than the shape is worth.
 */
export function Sparkline({ values, width = 96, height = 28, label }: SparklineProps) {
  if (values.length < 2) {
    return <span className="font-body-md text-body-md text-on-surface-variant">—</span>;
  }

  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min;
  const stepX = width / (values.length - 1);

  // A flat series has no range to scale against; draw it down the middle instead of dividing by zero.
  const toY = (value: number) =>
    span === 0 ? height / 2 : height - 2 - ((value - min) / span) * (height - 4);

  const points = values.map((value, index) => `${index * stepX},${toY(value)}`);
  const line = `M ${points.join(' L ')}`;
  const area = `${line} L ${width},${height} L 0,${height} Z`;
  const lastY = toY(values[values.length - 1]);

  return (
    <svg
      className="block overflow-visible"
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label={label}
      preserveAspectRatio="none"
    >
      <path d={area} className="fill-primary opacity-10" />
      <path
        d={line}
        className="fill-none stroke-primary"
        strokeWidth={1.6}
        strokeLinejoin="round"
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
      />
      <circle cx={width} cy={lastY} r={2.5} className="fill-primary" />
    </svg>
  );
}
