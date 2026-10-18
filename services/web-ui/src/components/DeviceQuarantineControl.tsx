import { useState } from 'react';
import { ApiError, fetchQuarantine, quarantineDevice, releaseDevice } from '../api/client';
import { useAsyncData } from '../hooks/useAsyncData';
import { Button } from './Controls';
import { formatRelative } from './format';

interface DeviceQuarantineControlProps {
  deviceId: string;
  tenantId: string;
  dataVersion: number;
}

/**
 * Quarantine or release one device from the fleet view. The current state comes from
 * {@code GET /api/v1/quarantine}; the processor applies a change within a few seconds.
 */
export function DeviceQuarantineControl({ deviceId, tenantId, dataVersion }: DeviceQuarantineControlProps) {
  const listState = useAsyncData((signal) => fetchQuarantine(tenantId || undefined, signal), [tenantId, dataVersion]);
  const [editing, setEditing] = useState(false);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const entry = listState.data?.find((candidate) => candidate.deviceId === deviceId) ?? null;

  const run = async (action: () => Promise<unknown>) => {
    setBusy(true);
    setError(null);
    try {
      await action();
      setEditing(false);
      setReason('');
      listState.reload();
    } catch (cause) {
      setError(cause instanceof ApiError || cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(false);
    }
  };

  if (entry) {
    return (
      <div className="flex flex-col gap-space-2xs rounded-lg bg-inverse-surface p-space-sm text-inverse-on-surface">
        <span className="flex items-center gap-space-2xs font-label-md text-label-md font-semibold">
          <span className="material-symbols-outlined text-[18px]" aria-hidden="true">block</span>
          Mis en quarantaine par @{entry.quarantinedBy} {formatRelative(entry.quarantinedAt)}
        </span>
        <span className="font-body-sm text-body-sm opacity-80">
          “{entry.reason}” · {entry.suppressedEvents.toLocaleString('fr-FR')} mesure{entry.suppressedEvents === 1 ? '' : 's'} ignorée{entry.suppressedEvents === 1 ? '' : 's'}
        </span>
        {error ? <span role="alert" className="font-body-sm text-body-sm">{error}</span> : null}
        <Button disabled={busy} onClick={() => run(() => releaseDevice(deviceId, entry.tenantId))}>
          Libérer le nœud
        </Button>
      </div>
    );
  }

  if (editing) {
    return (
      <div className="flex flex-col gap-space-2xs">
        <label htmlFor={`quarantine-${deviceId}`} className="font-label-md text-label-md font-semibold text-on-surface">
          Pourquoi mettre {deviceId} en quarantaine ?
        </label>
        <textarea
          id={`quarantine-${deviceId}`}
          className="min-h-[64px] rounded-lg border border-outline-variant bg-surface-container-lowest p-space-xs font-body-md text-body-md text-on-surface focus:border-primary focus:outline-none"
          maxLength={500}
          value={reason}
          placeholder="Les mesures semblent erronées ; exclues jusqu’à vérification"
          onChange={(event) => setReason(event.target.value)}
        />
        {error ? (
          <span role="alert" className="font-body-sm text-body-sm text-error">
            {error}
          </span>
        ) : null}
        <div className="flex gap-space-xs">
          <Button
            variant="primary"
            disabled={busy || !reason.trim()}
            onClick={() => run(() => quarantineDevice(deviceId, { tenantId: tenantId || undefined, reason: reason.trim() }))}
          >
            Mettre en quarantaine
          </Button>
          <Button variant="quiet" disabled={busy} onClick={() => setEditing(false)}>
            Annuler
          </Button>
        </div>
      </div>
    );
  }

  return (
    <Button disabled={listState.loading && !listState.data} onClick={() => setEditing(true)}>
      Mettre le nœud en quarantaine
    </Button>
  );
}
