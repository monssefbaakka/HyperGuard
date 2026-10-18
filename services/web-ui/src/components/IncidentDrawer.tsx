import type { AnomalyRecord } from '../api/types';
import { formatInstant, formatMeasurement, humanizeConstant, humanizeLabel } from './format';

interface IncidentDrawerProps {
  breach: AnomalyRecord;
  /** Real z-score of the flagged reading against its own device history, when it could be computed. */
  sigma: number | null;
  onClose: () => void;
  onOpenForensics: () => void;
}

/**
 * Detail for one flagged reading. Everything shown is a field of the stored record or arithmetic on
 * it — there is no remediation pipeline behind this console, so the action that would trigger one is
 * present but disabled rather than faked.
 */
export function IncidentDrawer({ breach, sigma, onClose, onOpenForensics }: IncidentDrawerProps) {
  const detectionLatencyMs = new Date(breach.ingestedAt).getTime() - new Date(breach.timestamp).getTime();

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-on-surface/40 p-space-md backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label="Breach forensics"
      onClick={onClose}
    >
      <div
        className="flex w-full max-w-lg flex-col gap-space-md rounded-xl bg-surface-container-lowest p-space-lg shadow-xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-space-xs">
            <span className="material-symbols-outlined text-[24px] text-error" aria-hidden="true">
              emergency_home
            </span>
            <h3 className="text-headline-md font-semibold text-on-surface">
              Breach Forensics: {breach.deviceId}
            </h3>
          </div>
          <button
            type="button"
            className="text-on-surface-variant hover:text-on-surface"
            aria-label="Close"
            onClick={onClose}
          >
            <span className="material-symbols-outlined" aria-hidden="true">close</span>
          </button>
        </div>

        <div className="flex flex-col gap-space-sm text-body-sm text-on-surface-variant">
          <p>
            {humanizeConstant(breach.severity)} · {humanizeConstant(breach.anomalyType)} recorded on{' '}
            {humanizeLabel(breach.metric)}. This is the stored record as the pipeline wrote it; no
            mitigation has been attempted, and this console has no control-plane API to attempt one.
          </p>

          <dl className="flex flex-col gap-space-2xs rounded bg-surface-container-low p-space-sm font-mono text-code-sm">
            {[
              ['Event', breach.eventId],
              ['Reading', `${formatMeasurement(breach.value)} vs threshold ${formatMeasurement(breach.threshold)}`],
              ['Deviation', sigma != null ? `${sigma.toFixed(2)}σ against this device's own history` : 'not enough history'],
              ['Measured at', formatInstant(breach.timestamp)],
              [
                'Detection latency',
                Number.isFinite(detectionLatencyMs) ? `${detectionLatencyMs} ms (measured → ingested)` : '—',
              ],
              ['Tenant', breach.tenantId],
            ].map(([label, value]) => (
              <div key={label} className="flex justify-between gap-space-md">
                <dt>{label}</dt>
                <dd className="truncate text-on-surface">{value}</dd>
              </div>
            ))}
          </dl>
        </div>

        <div className="flex justify-end gap-space-sm pt-space-2xs">
          <button
            type="button"
            className="h-10 rounded-lg bg-surface-container px-space-md text-label-md font-semibold text-on-surface hover:bg-surface-container-high"
            onClick={onClose}
          >
            Dismiss
          </button>
          <button
            type="button"
            className="h-10 rounded-lg border border-outline-variant px-space-md text-label-md font-semibold text-on-surface-variant disabled:cursor-not-allowed disabled:opacity-45"
            disabled
            title="Not wired to a control-plane API — this platform has no remediation endpoint to call."
          >
            Execute Remediation Flow
          </button>
          <button
            type="button"
            className="h-10 rounded-lg bg-primary px-space-md text-label-md font-semibold text-on-primary shadow-sm hover:bg-on-primary-fixed-variant"
            onClick={onOpenForensics}
          >
            Open in Forensics
          </button>
        </div>
      </div>
    </div>
  );
}
