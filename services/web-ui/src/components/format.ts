/**
 * Display helpers.
 *
 * The console is read by people who do not work on the pipeline, so times are shown as "4 minutes
 * ago" and units as "°C" rather than as raw instants and column values. The exact value is always
 * still available: every relative time carries the full timestamp as a tooltip, and the technical
 * details toggle puts the raw fields back on screen.
 */

const relativeFormatter = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });

/** "just now", "4 minutes ago", "2 days ago". Falls back to a date beyond a week. */
export function formatRelative(iso: string | null | undefined, now: number = Date.now()): string {
  if (!iso) {
    return 'never';
  }
  const time = new Date(iso).getTime();
  if (Number.isNaN(time)) {
    return iso;
  }

  const deltaSeconds = Math.round((time - now) / 1000);
  const absolute = Math.abs(deltaSeconds);

  if (absolute < 10) {
    return 'just now';
  }
  if (absolute < 60) {
    return relativeFormatter.format(Math.round(deltaSeconds), 'second');
  }
  if (absolute < 3600) {
    return relativeFormatter.format(Math.round(deltaSeconds / 60), 'minute');
  }
  if (absolute < 86400) {
    return relativeFormatter.format(Math.round(deltaSeconds / 3600), 'hour');
  }
  if (absolute < 604800) {
    return relativeFormatter.format(Math.round(deltaSeconds / 86400), 'day');
  }
  return formatDate(iso);
}

/** Date only, for things older than a week. */
export function formatDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return iso;
  }
  return date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

/** Full local date and time, used for tooltips and the technical columns. */
export function formatInstant(iso: string | null | undefined): string {
  if (!iso) {
    return '—';
  }
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return iso;
  }
  return date.toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

/** Clock-only label for chart axes, where the day is implied by the selected range. */
export function formatClock(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return iso;
  }
  return date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}

export function formatNumber(value: number): string {
  return new Intl.NumberFormat().format(value);
}

/**
 * Trims the trailing zeros the database returns (values are stored as NUMERIC(18,4), so a reading of
 * 21.5 arrives as 21.5000) and keeps at most two decimals.
 */
export function formatMeasurement(value: number): string {
  if (!Number.isFinite(value)) {
    return String(value);
  }
  return new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 }).format(value);
}

const UNIT_LABELS: Record<string, string> = {
  c: '°C',
  celsius: '°C',
  f: '°F',
  fahrenheit: '°F',
  k: 'K',
  pct: '%',
  percent: '%',
};

/** Renders a unit the way a reader expects to see it; unknown units are passed through unchanged. */
export function formatUnit(unit: string | null | undefined): string {
  if (!unit) {
    return '';
  }
  return UNIT_LABELS[unit.toLowerCase()] ?? unit;
}

/** A measurement and its unit, spaced the way the unit wants (no space before a degree sign). */
export function formatValueWithUnit(value: number, unit: string | null | undefined): string {
  const rendered = formatMeasurement(value);
  const label = formatUnit(unit);
  if (!label) {
    return rendered;
  }
  return label.startsWith('°') || label === '%' ? `${rendered}${label}` : `${rendered} ${label}`;
}

/** "temperature" -> "Temperature", "battery_level" -> "Battery level". */
export function humanizeLabel(value: string): string {
  const spaced = value.replace(/[_.]+/g, ' ').trim();
  if (!spaced) {
    return value;
  }
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

/** "CRITICAL" -> "Critical", "THRESHOLD_BREACH" -> "Threshold breach". */
export function humanizeConstant(value: string): string {
  return humanizeLabel(value.toLowerCase());
}

/**
 * Converts the value of a `datetime-local` input into an ISO instant for the API, and back.
 * The input has no timezone, so the browser's local zone is assumed in both directions.
 */
export function localInputToIso(value: string): string | undefined {
  if (!value) {
    return undefined;
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

export function isoToLocalInput(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return '';
  }
  const pad = (part: number) => String(part).padStart(2, '0');
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
    `T${pad(date.getHours())}:${pad(date.getMinutes())}`
  );
}
