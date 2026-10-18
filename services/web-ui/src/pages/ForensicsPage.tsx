import { useMemo, useState } from 'react';
import { fetchAnomalies } from '../api/client';
import type { AnomalyRecord, Facets } from '../api/types';
import { Select, toOptions } from '../components/Controls';
import { EmptyState, ErrorBanner, TableSkeleton } from '../components/Feedback';
import { formatInstant, humanizeConstant, humanizeLabel } from '../components/format';
import { useAsyncData } from '../hooks/useAsyncData';
import { IncidentDossier } from './IncidentDossier';

interface ForensicsPageProps {
  tenantId: string;
  facets: Facets | null;
  dataVersion: number;
  onInspectDevice: (deviceId: string) => void;
}

export interface Incident {
  id: string;
  deviceId: string;
  anomalies: AnomalyRecord[];
  start: string;
  end: string;
  maxSeverityRank: number;
  metrics: string[];
}

const SEVERITY_RANK: Record<string, number> = { critical: 3, warning: 2, info: 1 };

/** Anomalies on the same device separated by more than this are treated as unrelated incidents. */
const INCIDENT_GAP_MS = 15 * 60 * 1000;

/**
 * Groups anomalies into incidents by a plain rule — same device, less than 15 minutes apart —
 * rather than a causal-inference model. It is a real, inspectable grouping of what the platform
 * actually recorded, not a probability estimate.
 */
function groupIncidents(rows: AnomalyRecord[]): Incident[] {
  const byDevice = new Map<string, AnomalyRecord[]>();
  for (const row of rows) {
    const list = byDevice.get(row.deviceId) ?? [];
    list.push(row);
    byDevice.set(row.deviceId, list);
  }

  const incidents: Incident[] = [];
  for (const [deviceId, deviceRows] of byDevice) {
    const sorted = [...deviceRows].sort(
      (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
    );

    let current: AnomalyRecord[] = [];
    let lastTime = -Infinity;

    const flush = () => {
      if (current.length === 0) {
        return;
      }
      const metrics = [...new Set(current.map((row) => row.metric))];
      const maxSeverityRank = Math.max(
        ...current.map((row) => SEVERITY_RANK[row.severity.toLowerCase()] ?? 0),
      );
      incidents.push({
        id: `${deviceId}-${current[0].eventId}`,
        deviceId,
        anomalies: current,
        start: current[0].timestamp,
        end: current[current.length - 1].timestamp,
        maxSeverityRank,
        metrics,
      });
      current = [];
    };

    for (const row of sorted) {
      const time = new Date(row.timestamp).getTime();
      if (current.length > 0 && time - lastTime > INCIDENT_GAP_MS) {
        flush();
      }
      current.push(row);
      lastTime = time;
    }
    flush();
  }

  return incidents.sort((a, b) => new Date(b.end).getTime() - new Date(a.end).getTime());
}

const SEVERITY_BADGE: Record<number, string> = {
  3: 'text-error border-error/40 bg-error-container/50',
  2: 'text-tertiary border-tertiary/40 bg-tertiary-fixed/30',
  1: 'text-primary border-primary/30 bg-primary-fixed/30',
  0: 'text-on-surface-variant border-outline-variant bg-surface-container-low',
};
const SEVERITY_LABEL: Record<number, string> = { 3: 'Critical', 2: 'Warning', 1: 'Info', 0: 'Unclassified' };

/** An incident whose latest event is this recent is still treated as live triage. */
const ACTIVE_WITHIN_MS = 15 * 60 * 1000;

export function ForensicsPage({ tenantId, facets, dataVersion, onInspectDevice }: ForensicsPageProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [severityFilter, setSeverityFilter] = useState('');

  const state = useAsyncData(
    (signal) =>
      fetchAnomalies(
        { tenantId: tenantId || undefined, size: 300, sort: 'timestamp', direction: 'desc' },
        signal,
      ),
    [tenantId, dataVersion],
  );

  const allIncidents = useMemo(() => groupIncidents(state.data?.content ?? []), [state.data]);
  const incidents = useMemo(
    () =>
      severityFilter === ''
        ? allIncidents
        : allIncidents.filter((incident) => SEVERITY_LABEL[incident.maxSeverityRank].toLowerCase() === severityFilter),
    [allIncidents, severityFilter],
  );

  const activeCount = allIncidents.filter(
    (incident) => Date.now() - new Date(incident.end).getTime() < ACTIVE_WITHIN_MS,
  ).length;
  const severities = facets?.anomalySeverities ?? [];

  const selected = allIncidents.find((incident) => incident.id === selectedId) ?? null;

  if (selected) {
    return (
      <IncidentDossier
        incident={selected}
        tenantId={tenantId}
        dataVersion={dataVersion}
        onBack={() => setSelectedId(null)}
        onInspectDevice={onInspectDevice}
      />
    );
  }

  return (
    <div className="flex flex-col gap-space-xl">
      <section className="flex flex-col justify-between gap-space-md rounded-xl bg-surface-container-lowest p-space-lg shadow-sm lg:flex-row lg:items-start">
        <div className="flex flex-col gap-space-2xs">
          <div className="flex items-center gap-space-2xs font-label-sm text-label-sm uppercase tracking-wider text-on-surface-variant">
            <span>HyperGuard</span>
            <span className="material-symbols-outlined text-[14px]" aria-hidden="true">chevron_right</span>
            <span>Intelligence</span>
            <span className="material-symbols-outlined text-[14px]" aria-hidden="true">chevron_right</span>
            <span className="font-medium text-primary">Incident Forensics</span>
          </div>
          <div className="flex flex-wrap items-center gap-space-sm">
            <h1 className="text-display-lg font-semibold tracking-tight text-on-surface">
              Anomaly Forensics &amp; Root-Cause Analysis
            </h1>
            {activeCount > 0 ? (
              <span className="rounded-full bg-error-container px-space-sm py-0.5 font-label-sm text-label-sm font-semibold uppercase text-on-error-container">
                Live triage
              </span>
            ) : null}
          </div>
          <p className="max-w-3xl text-body-sm text-on-surface-variant">
            Flagged readings grouped into incidents by a plain rule — same device, less than 15 minutes apart. A real
            grouping of recorded events, not a trained root-cause model: there is no probability score here, only what
            was measured and when.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-space-sm">
          <Select
            value={severityFilter}
            options={toOptions(severities, humanizeConstant)}
            anyLabel={`All severities (${allIncidents.length})`}
            onChange={setSeverityFilter}
          />
          <button
            type="button"
            disabled
            title="Not wired to a control-plane API — this platform has no quarantine endpoint to call."
            className="flex h-10 items-center gap-space-2xs rounded-lg bg-error px-space-md font-label-md text-label-md font-semibold text-on-error shadow-sm disabled:cursor-not-allowed disabled:opacity-45"
          >
            <span className="material-symbols-outlined text-[18px]" aria-hidden="true">gavel</span>
            Trigger Automated Quarantine
          </button>
        </div>
      </section>

      <section className="rounded-xl bg-surface-container-lowest p-space-lg shadow-sm">
      <ErrorBanner error={state.error} onRetry={state.reload} />

      {state.loading && incidents.length === 0 ? (
        <TableSkeleton rows={4} columns={4} />
      ) : incidents.length === 0 && !state.error ? (
        <EmptyState
          title="No incidents to investigate"
          detail="Nothing has been flagged as anomalous recently, so there is nothing to group."
          icon="✓"
        />
      ) : (
        <div className="flex flex-col gap-space-md">
          {incidents.map((incident) => {
            const active = Date.now() - new Date(incident.end).getTime() < ACTIVE_WITHIN_MS;
            const worst = incident.anomalies.reduce((best, row) => {
              const deviation = Math.abs(row.value - row.threshold) / (Math.abs(row.threshold) || 1);
              const bestDeviation = Math.abs(best.value - best.threshold) / (Math.abs(best.threshold) || 1);
              return deviation > bestDeviation ? row : best;
            }, incident.anomalies[0]);
            const overBy = ((worst.value - worst.threshold) / (Math.abs(worst.threshold) || 1)) * 100;

            return (
              <button
                key={incident.id}
                type="button"
                className="flex w-full flex-wrap items-center justify-between gap-space-md rounded-xl bg-surface-container-low p-space-md text-left transition-shadow hover:shadow-md"
                onClick={() => setSelectedId(incident.id)}
              >
                <div className="flex min-w-0 flex-1 flex-col gap-space-2xs">
                  <div className="flex flex-wrap items-center gap-space-xs">
                    <span className="rounded bg-surface-container-high px-space-xs py-0.5 font-mono text-code-sm font-semibold text-on-surface">
                      {incident.id}
                    </span>
                    <span
                      className={`inline-block rounded-full border px-3 py-0.5 font-body-sm text-body-sm ${SEVERITY_BADGE[incident.maxSeverityRank]}`}
                    >
                      {SEVERITY_LABEL[incident.maxSeverityRank]} ({overBy >= 0 ? '+' : ''}
                      {overBy.toFixed(1)}%)
                    </span>
                    {active ? (
                      <span className="rounded-full bg-error px-space-xs py-0.5 font-label-sm text-label-sm font-semibold uppercase text-on-error">
                        Active
                      </span>
                    ) : null}
                  </div>
                  <p className="font-label-md text-label-md font-semibold text-on-surface">
                    {incident.deviceId} · {incident.metrics.map(humanizeLabel).join(', ')}
                  </p>
                  <p className="font-mono text-code-sm text-on-surface-variant">
                    {incident.anomalies.length} flagged reading{incident.anomalies.length === 1 ? '' : 's'} ·{' '}
                    {formatInstant(incident.start)} → {formatInstant(incident.end)}
                  </p>
                </div>
                <span className="material-symbols-outlined text-on-surface-variant" aria-hidden="true">
                  chevron_right
                </span>
              </button>
            );
          })}
        </div>
      )}
      </section>
    </div>
  );
}
