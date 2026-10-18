import type { AnomalyRecord } from '../api/types';
import { formatInstant, formatRelative, formatValueWithUnit, humanizeConstant, humanizeLabel } from './format';

interface SentinelFeedProps {
  anomalies: AnomalyRecord[];
  /** Real z-score per event id, where the device's history was available to compute one. */
  sigmas: Record<string, number>;
  unit: string | null;
  onInspect: (breach: AnomalyRecord) => void;
}

const CARD_TONE: Record<string, string> = {
  critical: 'bg-error-container',
  warning: 'bg-tertiary-container',
  info: 'bg-secondary-container',
};

const BADGE_TONE: Record<string, string> = {
  critical: 'bg-error text-on-error',
  warning: 'bg-tertiary text-on-tertiary',
  info: 'bg-secondary text-on-secondary',
};

const ACTION_TONE: Record<string, string> = {
  critical: 'bg-error text-on-error hover:opacity-90',
  warning: 'bg-surface-container-high text-on-surface hover:bg-surface-variant',
  info: 'bg-surface-container-high text-on-surface hover:bg-surface-variant',
};

/**
 * Recent flagged readings, newest first. The reading, the threshold it broke and the sigma are all
 * real values from the stored record; nothing here is a model output or a confidence score.
 */
export function SentinelFeed({ anomalies, sigmas, unit, onInspect }: SentinelFeedProps) {
  if (anomalies.length === 0) {
    return (
      <div className="flex flex-1 items-center rounded-lg bg-surface-container-low p-space-md text-body-sm text-on-surface-variant">
        Nothing flagged recently. This feed fills in as the pipeline records anomalies.
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col gap-space-sm overflow-y-auto pr-space-2xs">
      {anomalies.map((row) => {
        const severity = row.severity.toLowerCase();
        const sigma = sigmas[row.eventId];

        return (
          <div
            key={row.eventId}
            className={`flex flex-col gap-space-xs rounded-lg p-space-md ${CARD_TONE[severity] ?? 'bg-surface-container-low'}`}
          >
            <div className="flex items-center justify-between gap-space-xs">
              <span
                className={`rounded px-space-2xs py-0.5 font-label-sm text-label-sm font-semibold uppercase tracking-wide ${BADGE_TONE[severity] ?? 'bg-surface-container-high text-on-surface'}`}
              >
                {humanizeConstant(row.severity)} {severity === 'critical' ? 'Breach' : ''}
              </span>
              <span className="font-mono text-code-sm text-on-surface-variant" title={formatInstant(row.timestamp)}>
                {formatRelative(row.timestamp)}
              </span>
            </div>

            <div>
              <h3 className="text-headline-sm font-semibold text-on-surface">
                {row.deviceId}: {humanizeLabel(row.metric)} breach
              </h3>
              <p className="mt-space-2xs text-body-sm text-on-surface-variant">
                Telemetry reached{' '}
                <strong className="font-mono text-code-sm text-error">{formatValueWithUnit(row.value, unit)}</strong>
                {' '}against a recorded threshold of{' '}
                <strong>{formatValueWithUnit(row.threshold, unit)}</strong>
                {sigma != null ? (
                  <>
                    , a deviation of <strong>{sigma.toFixed(2)}σ</strong> from this device's own history
                  </>
                ) : null}
                .
              </p>
            </div>

            <div className="flex items-center justify-between gap-space-xs pt-space-2xs">
              <span className="truncate font-mono text-code-sm text-on-surface-variant">Node: {row.deviceId}</span>
              <button
                type="button"
                className={`h-8 flex-none rounded-md px-space-sm font-label-md text-label-md font-semibold shadow-sm ${ACTION_TONE[severity] ?? ACTION_TONE.info}`}
                onClick={() => onInspect(row)}
              >
                Investigate
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
