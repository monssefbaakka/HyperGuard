import type { ReactNode } from 'react';
import { Sparkline } from './Sparkline';

interface KpiCardProps {
  label: string;
  /** Badge or short status text on the label row. */
  headerRight?: ReactNode;
  value: ReactNode;
  /** Small unit rendered next to the metric, e.g. "eps" or "ms". */
  unit?: string;
  /** Qualifier rendered at metric size next to the value, e.g. "Critical". */
  valueSuffix?: ReactNode;
  visual?: ReactNode;
  footer: ReactNode;
  tone?: 'default' | 'critical';
  onClick?: () => void;
}

/**
 * A circular progress ring on a 100-unit-long path (radius 15.9155 makes the circumference ~100), so
 * `percent` maps straight onto stroke-dasharray.
 */
export function RingMeter({ percent, label }: { percent: number; label?: string }) {
  const clamped = Math.max(0, Math.min(100, percent));
  const track = 'M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831';
  return (
    <span className="relative flex h-10 w-10 flex-none items-center justify-center">
      <svg viewBox="0 0 36 36" className="h-full w-full -rotate-90" aria-hidden="true">
        <path d={track} fill="none" stroke="currentColor" strokeWidth="3.5" className="text-surface-container-high" />
        <path
          d={track}
          fill="none"
          stroke="currentColor"
          strokeWidth="3.5"
          strokeDasharray={`${clamped}, 100`}
          strokeLinecap="round"
          className="text-secondary"
        />
      </svg>
      <span className="absolute font-mono text-label-sm font-semibold text-secondary">
        {label ?? Math.round(clamped)}
      </span>
    </span>
  );
}

/** The mockup's sparkline slot: a bare trend line, no fill, sized to the card. */
export function KpiSparkline({ values, label, tone = 'primary' }: { values: number[]; label: string; tone?: 'primary' | 'secondary' }) {
  return (
    <span className={tone === 'secondary' ? 'text-secondary [&_path]:stroke-current [&_circle]:fill-current' : ''}>
      <Sparkline values={values} label={label} width={80} height={32} />
    </span>
  );
}

export function KpiCard({
  label,
  headerRight,
  value,
  unit,
  valueSuffix,
  visual,
  footer,
  tone = 'default',
  onClick,
}: KpiCardProps) {
  const classes = `flex flex-col justify-between gap-space-sm rounded-xl bg-surface-container-lowest p-space-lg text-left shadow-sm ring-1 ring-surface-container-high/60 ${
    onClick ? 'transition-shadow hover:shadow-md' : ''
  }`;

  const body = (
    <>
      <div className="flex items-center justify-between gap-space-sm">
        <span
          className={`font-label-sm text-label-sm uppercase tracking-wider ${
            tone === 'critical' ? 'text-error' : 'text-on-surface-variant'
          }`}
        >
          {label}
        </span>
        {headerRight}
      </div>

      <div className="my-space-xs flex items-baseline justify-between gap-space-sm">
        <span className="flex items-baseline gap-1.5">
          <span
            className={`font-mono text-metric-xl font-semibold tabular-nums ${
              tone === 'critical' ? 'text-error' : 'text-on-surface'
            }`}
          >
            {value}
          </span>
          {unit ? <span className="font-mono text-code-sm text-on-surface-variant">{unit}</span> : null}
          {valueSuffix ? (
            <span className={`text-headline-sm font-semibold ${tone === 'critical' ? 'text-error' : 'text-on-surface'}`}>
              {valueSuffix}
            </span>
          ) : null}
        </span>
        {visual ? <span className="flex flex-none items-center self-center">{visual}</span> : null}
      </div>

      <div className="font-mono text-code-sm text-on-surface-variant">{footer}</div>
    </>
  );

  if (onClick) {
    return (
      <button type="button" className={classes} onClick={onClick}>
        {body}
      </button>
    );
  }

  return <div className={classes}>{body}</div>;
}
