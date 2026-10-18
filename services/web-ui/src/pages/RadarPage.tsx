import { useEffect, useMemo, useState } from 'react';
import type { Facets } from '../api/types';
import { RadarChart } from '../components/RadarChart';
import { Field, Select, toOptions } from '../components/Controls';
import { humanizeLabel, formatValueWithUnit } from '../components/format';
import { useDeviationRadar } from '../hooks/useDeviationRadar';
import { AlertsPage } from './AlertsPage';

interface RadarPageProps {
  tenantId: string;
  facets: Facets | null;
  technical: boolean;
  dataVersion: number;
  /** Device picked from another screen's "Spectral Radar" action; applied once, then cleared. */
  focusDeviceId?: string | null;
  onFocusConsumed?: () => void;
}

const MAX_AXES = 6;
const MAX_FLEET_THUMBS = 4;

function DeviceRadarThumb({
  tenantId,
  deviceId,
  metrics,
  dataVersion,
}: {
  tenantId: string;
  deviceId: string;
  metrics: string[];
  dataVersion: number;
}) {
  const { axes, loading } = useDeviationRadar(tenantId, deviceId, metrics, dataVersion);
  return (
    <div className="flex flex-col items-center gap-2 rounded-lg bg-surface-container-low p-space-sm">
      {loading && axes.length === 0 ? (
        <div className="flex h-[140px] w-[140px] items-center justify-center">
          <span className="h-6 w-6 animate-spin rounded-full border-2 border-outline-variant border-t-primary" />
        </div>
      ) : (
        <RadarChart axes={axes} size={140} compact />
      )}
      <span className="font-label-sm text-label-sm font-semibold text-on-surface">{deviceId}</span>
    </div>
  );
}

export function RadarPage({
  tenantId,
  facets,
  technical,
  dataVersion,
  focusDeviceId,
  onFocusConsumed,
}: RadarPageProps) {
  const [deviceId, setDeviceId] = useState('');
  const devices = useMemo(() => facets?.devices ?? [], [facets]);
  const axisMetrics = useMemo(() => (facets?.metrics ?? []).slice(0, MAX_AXES), [facets]);

  useEffect(() => {
    if (focusDeviceId) {
      setDeviceId(focusDeviceId);
      onFocusConsumed?.();
    }
  }, [focusDeviceId, onFocusConsumed]);

  useEffect(() => {
    if (focusDeviceId) {
      return;
    }
    if (devices.length > 0 && !devices.includes(deviceId)) {
      setDeviceId(devices[0]);
    }
  }, [devices, deviceId, focusDeviceId]);

  const { axes, averageAbsZ, loading } = useDeviationRadar(tenantId, deviceId, axisMetrics, dataVersion);
  const fleet = devices.slice(0, MAX_FLEET_THUMBS);

  const scoreTone = averageAbsZ >= 2.5 ? 'text-error' : averageAbsZ >= 1.2 ? 'text-tertiary' : 'text-secondary';

  return (
    <div className="flex flex-col gap-space-xl">
      <section className="rounded-xl border border-surface-container-high bg-surface-container-lowest p-space-lg shadow-sm">
        <div className="mb-space-lg flex flex-wrap items-start justify-between gap-space-md">
          <div>
            <h2 className="font-headline-md text-headline-md font-semibold text-on-surface">Anomaly Radar</h2>
            <p className="mt-1 max-w-2xl font-body-md text-body-md text-on-surface-variant">
              Multi-axis deviation from each device's own recent baseline — a plain z-score computed across up
              to {MAX_AXES} measurements, not a trained model. The dashed ring is "no deviation"; the further a
              point sits from it, the more unusual that measurement is right now.
            </p>
          </div>
          <Field label="Device">
            <Select value={deviceId} options={toOptions(devices)} onChange={setDeviceId} disabled={devices.length === 0} />
          </Field>
        </div>

        {axisMetrics.length === 0 ? (
          <p className="font-body-md text-body-md text-on-surface-variant">
            No measurements reported yet — a radar needs at least three distinct measurement types.
          </p>
        ) : (
          <div className="grid grid-cols-1 gap-space-lg lg:grid-cols-[auto_1fr]">
            <div className="flex flex-col items-center gap-space-md">
              {loading && axes.length === 0 ? (
                <div className="flex h-[280px] w-[280px] items-center justify-center">
                  <span className="h-8 w-8 animate-spin rounded-full border-2 border-outline-variant border-t-primary" />
                </div>
              ) : (
                <RadarChart axes={axes} size={280} />
              )}
              <div className="text-center">
                <span className="font-label-sm text-label-sm uppercase tracking-wider text-outline">
                  Average deviation (|z-score|)
                </span>
                <p className={`font-mono text-headline-lg font-semibold tabular-nums ${scoreTone}`}>
                  {averageAbsZ.toFixed(2)}&sigma;
                </p>
              </div>
            </div>

            <div className="overflow-hidden rounded-xl border border-surface-container-high">
              <table className="w-full border-collapse">
                <thead>
                  <tr className="border-b border-surface-container-high bg-surface-container-low">
                    <th className="px-space-md py-space-sm text-left font-label-md text-label-md font-semibold text-on-surface-variant">
                      Measurement
                    </th>
                    <th className="px-space-md py-space-sm text-right font-label-md text-label-md font-semibold text-on-surface-variant">
                      Latest
                    </th>
                    <th className="px-space-md py-space-sm text-right font-label-md text-label-md font-semibold text-on-surface-variant">
                      z-score
                    </th>
                    <th className="px-space-md py-space-sm text-left font-label-md text-label-md font-semibold text-on-surface-variant">
                      Deviation
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {axes.map((axis) => (
                    <tr key={axis.metric} className="border-t border-surface-container-high">
                      <td className="px-space-md py-space-sm font-body-md text-body-md text-on-surface">
                        {humanizeLabel(axis.metric)}
                      </td>
                      <td className="px-space-md py-space-sm text-right font-mono text-body-md tabular-nums text-on-surface">
                        {axis.noBaseline || axis.latestValue === null
                          ? '—'
                          : formatValueWithUnit(axis.latestValue, axis.unit)}
                      </td>
                      <td className="px-space-md py-space-sm text-right font-mono text-body-md tabular-nums text-on-surface-variant">
                        {axis.noBaseline ? 'n/a' : axis.zScore.toFixed(2)}
                      </td>
                      <td className="px-space-md py-space-sm">
                        <div className="h-1.5 w-full max-w-[140px] rounded-full bg-surface-container-high">
                          <div
                            className={`h-1.5 rounded-full ${
                              Math.abs(axis.magnitude - 50) > 20 ? 'bg-error' : 'bg-primary'
                            }`}
                            style={{ width: `${Math.min(100, Math.abs(axis.magnitude - 50) * 2)}%` }}
                          />
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </section>

      {fleet.length > 1 ? (
        <section className="rounded-xl border border-surface-container-high bg-surface-container-lowest p-space-lg shadow-sm">
          <h3 className="mb-space-md font-headline-md text-headline-md font-semibold text-on-surface">
            Fleet deviation fingerprints
          </h3>
          <div className="flex flex-wrap gap-space-md">
            {fleet.map((id) => (
              <DeviceRadarThumb key={id} tenantId={tenantId} deviceId={id} metrics={axisMetrics} dataVersion={dataVersion} />
            ))}
          </div>
        </section>
      ) : null}

      <AlertsPage
        tenantId={tenantId}
        facets={facets}
        technical={technical}
        dataVersion={dataVersion}
        title="Event interception log"
        subtitle="Readings the platform has already flagged as anomalous, independent of the radar above."
      />
    </div>
  );
}
