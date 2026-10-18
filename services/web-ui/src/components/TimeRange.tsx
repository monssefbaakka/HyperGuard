import { TextInput } from './Controls';
import { localInputToIso } from './format';

export type TimeRangePreset = 'hour' | 'day' | 'week' | 'month' | 'all' | 'custom';

export interface TimeRange {
  preset: TimeRangePreset;
  /** Only meaningful while the preset is `custom`; both are `datetime-local` input values. */
  fromInput: string;
  toInput: string;
}

export const DEFAULT_TIME_RANGE: TimeRange = { preset: 'all', fromInput: '', toInput: '' };

const PRESETS: { id: TimeRangePreset; label: string; minutes?: number }[] = [
  { id: 'hour', label: 'Last hour', minutes: 60 },
  { id: 'day', label: 'Last 24 hours', minutes: 60 * 24 },
  { id: 'week', label: 'Last 7 days', minutes: 60 * 24 * 7 },
  { id: 'month', label: 'Last 30 days', minutes: 60 * 24 * 30 },
  { id: 'all', label: 'All time' },
  { id: 'custom', label: 'Custom…' },
];

/**
 * Turns the selection into the instants the API wants.
 *
 * <p>Relative presets are resolved at call time rather than when the button was clicked, so "last
 * hour" keeps meaning the last hour as the page is reloaded instead of freezing at the moment of
 * selection.
 */
export function resolveTimeRange(range: TimeRange): { from?: string; to?: string } {
  if (range.preset === 'custom') {
    return { from: localInputToIso(range.fromInput), to: localInputToIso(range.toInput) };
  }

  const preset = PRESETS.find((entry) => entry.id === range.preset);
  if (!preset?.minutes) {
    return {};
  }

  return { from: new Date(Date.now() - preset.minutes * 60_000).toISOString(), to: undefined };
}

/** Short label for the current selection, for use in headings and empty states. */
export function describeTimeRange(range: TimeRange): string {
  if (range.preset === 'custom') {
    return 'the selected period';
  }
  const preset = PRESETS.find((entry) => entry.id === range.preset);
  return preset ? preset.label.toLowerCase() : 'all time';
}

interface TimeRangePickerProps {
  value: TimeRange;
  onChange: (value: TimeRange) => void;
}

/**
 * Period selector.
 *
 * <p>Presets cover what people actually ask for; the two date boxes only appear once someone
 * deliberately chooses a custom period, so the common case is a single click.
 */
export function TimeRangePicker({ value, onChange }: TimeRangePickerProps) {
  return (
    <div className="flex flex-wrap items-center gap-space-md border-b border-surface-container-high py-space-md">
      <span className="font-label-md text-label-md font-medium text-on-surface-variant">Period</span>
      <div
        className="inline-flex flex-wrap gap-1 rounded-lg bg-surface-container-low p-1"
        role="group"
        aria-label="Period"
      >
        {PRESETS.map((preset) => (
          <button
            key={preset.id}
            type="button"
            className={`rounded-md px-space-sm py-1.5 font-label-sm text-label-sm transition-colors ${
              value.preset === preset.id
                ? 'bg-surface-container-lowest font-semibold text-on-surface shadow-sm'
                : 'text-on-surface-variant hover:text-on-surface'
            }`}
            aria-pressed={value.preset === preset.id}
            onClick={() => onChange({ ...value, preset: preset.id })}
          >
            {preset.label}
          </button>
        ))}
      </div>

      {value.preset === 'custom' ? (
        <div className="flex flex-wrap gap-space-md">
          <label className="flex min-w-0 flex-col gap-1.5">
            <span className="font-label-md text-label-md font-medium text-on-surface-variant">From</span>
            <TextInput
              type="datetime-local"
              value={value.fromInput}
              onChange={(fromInput) => onChange({ ...value, fromInput })}
            />
          </label>
          <label className="flex min-w-0 flex-col gap-1.5">
            <span className="font-label-md text-label-md font-medium text-on-surface-variant">To</span>
            <TextInput
              type="datetime-local"
              value={value.toInput}
              onChange={(toInput) => onChange({ ...value, toInput })}
            />
          </label>
        </div>
      ) : null}
    </div>
  );
}
