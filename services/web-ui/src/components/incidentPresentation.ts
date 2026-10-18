import type { IncidentRecord, IncidentStatus } from '../api/types';

/** Badge colours per backend severity; anything else renders neutral. */
export const SEVERITY_BADGE: Record<string, string> = {
  critical: 'text-error border-error/40 bg-error-container/50',
  warning: 'text-tertiary border-tertiary/40 bg-tertiary-fixed/30',
};
export const NEUTRAL_BADGE = 'text-on-surface-variant border-outline-variant bg-surface-container-low';

/** How each triage state reads at a glance. */
export const STATUS_PILL: Record<IncidentStatus, { label: string; className: string; icon: string }> = {
  OPEN: { label: 'Ouvert', className: 'bg-error text-on-error', icon: 'error' },
  ACKNOWLEDGED: { label: 'Pris en compte', className: 'bg-tertiary-fixed text-on-tertiary-fixed', icon: 'front_hand' },
  RESOLVED: { label: 'Résolu', className: 'bg-secondary-container text-on-secondary-container', icon: 'task_alt' },
};

export function incidentReference(id: number): string {
  return `INC-${String(id).padStart(4, '0')}`;
}

/** Signed distance of the incident's worst reading from its limit, as a share of that limit. */
export function peakOverPercent(incident: Pick<IncidentRecord, 'peakValue' | 'peakThreshold'>): number {
  return ((incident.peakValue - incident.peakThreshold) / (Math.abs(incident.peakThreshold) || 1)) * 100;
}
