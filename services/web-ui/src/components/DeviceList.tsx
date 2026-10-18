import type { DeviceSummary } from '../api/types';
import { Sparkline } from './Sparkline';
import { formatInstant, formatNumber, formatRelative, formatValueWithUnit, humanizeLabel } from './format';

/** A device that has not reported for this long is called out as quiet. */
const QUIET_AFTER_MS = 15 * 60 * 1000;

interface DeviceListProps {
  devices: DeviceSummary[];
  /** Recent values per device id, oldest first; missing entries simply render without a trend. */
  trends: Record<string, number[]>;
  onSelect: (deviceId: string) => void;
}

export function DeviceList({ devices, trends, onSelect }: DeviceListProps) {
  const now = Date.now();

  return (
    <ul className="flex flex-col gap-space-sm">
      {devices.map((device) => {
        const lastSeen = new Date(device.lastSeen).getTime();
        const quiet = !Number.isNaN(lastSeen) && now - lastSeen > QUIET_AFTER_MS;
        const values = trends[device.deviceId] ?? [];

        return (
          <li key={device.deviceId}>
            <button
              type="button"
              className="flex w-full flex-wrap items-center gap-space-md rounded-lg bg-surface-container-low p-space-sm text-left transition-colors hover:bg-surface-container sm:flex-nowrap"
              onClick={() => onSelect(device.deviceId)}
            >
              <span
                className={`h-2.5 w-2.5 flex-none rounded-full ${quiet ? 'bg-outline-variant' : 'bg-secondary'}`}
                aria-hidden="true"
              />

              <span className="flex min-w-[140px] flex-1 flex-col">
                <span className="font-label-md text-label-md font-semibold text-on-surface">{device.deviceId}</span>
                <span className="font-body-sm text-body-sm text-on-surface-variant">
                  {humanizeLabel(device.metric)} · {device.location}
                </span>
              </span>

              <span className="hidden items-center sm:flex">
                <Sparkline
                  values={values}
                  label={`Recent ${humanizeLabel(device.metric).toLowerCase()} for ${device.deviceId}`}
                />
              </span>

              <span className="font-headline-sm text-headline-sm font-semibold tabular-nums text-on-surface">
                {formatValueWithUnit(device.lastValue, device.unit)}
              </span>

              <span
                className={`text-right font-body-sm text-body-sm ${quiet ? 'text-tertiary' : 'text-on-surface-variant'}`}
                title={formatInstant(device.lastSeen)}
              >
                {formatRelative(device.lastSeen)}
              </span>

              <span className="hidden text-right font-body-sm text-body-sm tabular-nums text-on-surface-variant md:block">
                {formatNumber(device.readings)} readings
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
