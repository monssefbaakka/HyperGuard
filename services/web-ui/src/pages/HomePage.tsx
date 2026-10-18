import { useMemo, useState } from 'react';
import { fetchActivity, fetchAnomalies, fetchDevices, fetchSeries, fetchTelemetry } from '../api/client';
import type { AnomalyRecord, Summary, TelemetryRecord } from '../api/types';
import { ActivityChart } from '../components/ActivityChart';
import { ClusterMatrix } from '../components/ClusterMatrix';
import { Button } from '../components/Controls';
import { DeviceList } from '../components/DeviceList';
import { EmptyState, ErrorBanner, TableSkeleton } from '../components/Feedback';
import { IncidentDrawer } from '../components/IncidentDrawer';
import { KpiCard, KpiSparkline, RingMeter } from '../components/KpiCard';
import { SentinelFeed } from '../components/SentinelFeed';
import { TelemetryTrace, type SignalSeries } from '../components/TelemetryTrace';
import {
  formatInstant,
  formatMeasurement,
  formatNumber,
  formatRelative,
  formatValueWithUnit,
  humanizeLabel,
} from '../components/format';
import { useAsyncData, type AsyncState } from '../hooks/useAsyncData';
import type { PlatformMetrics } from '../hooks/usePlatformMetrics';
import { zScoreAgainstHistory } from '../lib/signal';

export type PageId = 'home' | 'readings' | 'alerts' | 'trends' | 'radar' | 'forensics' | 'send' | 'topology';

interface HomePageProps {
  tenantId: string;
  summary: Summary | null;
  summaryLoading: boolean;
  dataVersion: number;
  autoRefresh: boolean;
  /** Scraped service telemetry, loaded once by the shell so the header and this page agree. */
  metricsState: AsyncState<PlatformMetrics>;
  onNavigate: (page: PageId) => void;
  onSelectDevice: (deviceId: string) => void;
}

/** A reading older than this means the pipeline has gone quiet, which is worth saying out loud. */
const STALE_AFTER_MS = 15 * 60 * 1000;

const DEVICE_LIMIT = 8;
const TREND_POINTS = 20;
/** How many of the fleet's busiest devices are overlaid on the main trace. */
const TRACE_DEVICES = 3;

const WINDOWS = [
  { id: 'live', label: 'Live', hours: null },
  { id: '1h', label: '1h', hours: 1 },
  { id: '24h', label: '24h', hours: 24 },
  { id: '7d', label: '7d', hours: 168 },
] as const;

type WindowId = (typeof WINDOWS)[number]['id'];

/** Points plotted on the trace for each window — a wider window earns more of them. */
const WINDOW_POINTS: Record<WindowId, number> = { live: 40, '1h': 60, '24h': 120, '7d': 200 };

export function HomePage({
  tenantId,
  summary,
  summaryLoading,
  dataVersion,
  autoRefresh,
  metricsState,
  onNavigate,
  onSelectDevice,
}: HomePageProps) {
  const [windowId, setWindowId] = useState<WindowId>('live');
  const [inspected, setInspected] = useState<AnomalyRecord | null>(null);

  const windowHours = WINDOWS.find((entry) => entry.id === windowId)?.hours ?? null;
  const from = windowHours ? new Date(Date.now() - windowHours * 3_600_000).toISOString() : undefined;

  const metrics = metricsState.data;

  const activity = useAsyncData(
    (signal) => fetchActivity({ tenantId: tenantId || undefined, from }, signal),
    [tenantId, from, dataVersion],
  );

  const recentAnomalies = useAsyncData(
    (signal) =>
      fetchAnomalies(
        { tenantId: tenantId || undefined, from, size: 50, sort: 'timestamp', direction: 'desc' },
        signal,
      ),
    [tenantId, from, dataVersion],
  );

  const devices = useAsyncData(
    (signal) => fetchDevices({ tenantId: tenantId || undefined, limit: DEVICE_LIMIT }, signal),
    [tenantId, dataVersion],
  );

  const deviceKey = (devices.data ?? []).map((device) => `${device.deviceId}:${device.metric}`).join(',');

  /*
   * One small series per device drives the trend lines. They are fetched together and a failure is
   * swallowed per device: a missing sparkline is a cosmetic loss, and it should never take the
   * device list down with it.
   */
  const trends = useAsyncData(
    async (signal) => {
      const list = devices.data ?? [];
      if (list.length === 0) {
        return {} as Record<string, number[]>;
      }

      const results = await Promise.all(
        list.map(async (device) => {
          try {
            const series = await fetchSeries(
              { tenantId: tenantId || undefined, deviceId: device.deviceId, metric: device.metric, limit: TREND_POINTS },
              signal,
            );
            return [device.deviceId, series.points.map((point) => Number(point.value))] as const;
          } catch {
            return [device.deviceId, [] as number[]] as const;
          }
        }),
      );

      return Object.fromEntries(results) as Record<string, number[]>;
    },
    [tenantId, deviceKey, dataVersion],
  );

  const recent = useAsyncData(
    (signal) =>
      fetchTelemetry({ tenantId: tenantId || undefined, from, size: 8, sort: 'timestamp', direction: 'desc' }, signal),
    [tenantId, from, dataVersion],
  );

  // The trace overlays the busiest devices' own readings of their shared measurement. Devices rather
  // than metrics: this platform records one measurement type today, but many devices, so this is the
  // grouping that actually produces more than one curve.
  const traceDevices = useMemo(() => (devices.data ?? []).slice(0, TRACE_DEVICES), [devices.data]);
  const traceMetric = traceDevices[0]?.metric ?? '';
  const traceUnit = traceDevices[0]?.unit ?? null;
  const trace = useAsyncData<SignalSeries[]>(
    async (signal) => {
      if (traceDevices.length === 0 || !traceMetric) {
        return [];
      }
      return Promise.all(
        traceDevices.map(async (device): Promise<SignalSeries> => {
          try {
            const series = await fetchSeries(
              {
                tenantId: tenantId || undefined,
                deviceId: device.deviceId,
                metric: traceMetric,
                from,
                limit: WINDOW_POINTS[windowId],
              },
              signal,
            );
            return {
              metric: device.deviceId,
              label: device.deviceId,
              points: series.points.map((point) => ({ timestamp: point.timestamp, value: Number(point.value) })),
            };
          } catch {
            return { metric: device.deviceId, label: device.deviceId, points: [] };
          }
        }),
      );
    },
    [tenantId, traceDevices.map((device) => device.deviceId).join(','), traceMetric, from, windowId, dataVersion],
  );

  const rows: TelemetryRecord[] = recent.data?.content ?? [];
  const deviceRows = devices.data ?? [];
  const anomalyRows: AnomalyRecord[] = recentAnomalies.data?.content ?? [];
  const traceSeries = trace.data ?? [];

  // Throughput, latency and cluster figures come from Prometheus; the anomaly and fleet figures come
  // from the read API. Both are real measurements of the same running system.
  const epsTrend =
    metrics?.eventsPerSecond != null && metrics.eventsPerSecondPrior
      ? ((metrics.eventsPerSecond - metrics.eventsPerSecondPrior) / metrics.eventsPerSecondPrior) * 100
      : null;
  const p99Ms = metrics?.p99Seconds != null ? metrics.p99Seconds * 1000 : null;

  const now = Date.now();
  const activeDeviceCount = deviceRows.filter((device) => {
    const lastSeen = new Date(device.lastSeen).getTime();
    return !Number.isNaN(lastSeen) && now - lastSeen < STALE_AFTER_MS;
  }).length;
  const totalDevices = summary?.devices ?? deviceRows.length;
  const fleetRatio = totalDevices > 0 ? (Math.min(activeDeviceCount, totalDevices) / totalDevices) * 100 : null;

  const criticalCount = anomalyRows.filter((row) => row.severity.toLowerCase() === 'critical').length;

  // Sigma per flagged reading, against that device's own plotted history. Only devices on the trace
  // have a series loaded, so the rest simply carry no sigma rather than an invented one.
  const sigmas = useMemo(() => {
    const bySeries = new Map(traceSeries.map((line) => [line.metric, line.points.map((point) => point.value)]));
    const result: Record<string, number> = {};
    for (const row of anomalyRows) {
      const history = bySeries.get(row.deviceId);
      if (history && history.length > 1) {
        result[row.eventId] = zScoreAgainstHistory(row.value, history);
      }
    }
    return result;
  }, [anomalyRows, traceSeries]);

  const traceDeviceIds = useMemo(() => new Set(traceDevices.map((device) => device.deviceId)), [traceDevices]);
  const traceBreaches = useMemo(
    () => anomalyRows.filter((row) => traceDeviceIds.has(row.deviceId) && row.metric === traceMetric).slice(0, 4),
    [anomalyRows, traceDeviceIds, traceMetric],
  );
  const traceThreshold =
    traceBreaches.length > 0 ? traceBreaches.reduce((sum, row) => sum + row.threshold, 0) / traceBreaches.length : null;

  const exportReport = () => {
    const report = {
      generatedAt: new Date().toISOString(),
      window: windowId,
      tenant: tenantId || 'all',
      summary,
      platformMetrics: metrics,
      devices: deviceRows,
      anomalies: anomalyRows,
      trace: traceSeries,
    };
    const url = URL.createObjectURL(new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `hyperguard-overview-${Date.now()}.json`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const allOperational = metrics?.targetsUp != null && metrics.targetsUp === metrics.targetsTotal;

  return (
    <div className="flex flex-col gap-space-xl">
      {/* Dashboard header and action controls */}
      <section className="flex flex-col justify-between gap-space-md rounded-xl bg-surface-container-lowest p-space-lg shadow-sm md:flex-row md:items-center">
        <div className="flex flex-col gap-space-2xs">
          <div className="flex items-center gap-space-2xs font-label-sm text-label-sm text-on-surface-variant">
            <span>HyperGuard</span>
            <span className="material-symbols-outlined text-[14px]" aria-hidden="true">chevron_right</span>
            <span>Dashboard</span>
            <span className="material-symbols-outlined text-[14px]" aria-hidden="true">chevron_right</span>
            <span className="font-medium text-primary">Overview</span>
          </div>
          <h1 className="text-display-lg font-semibold tracking-tight text-on-surface">
            Global Telemetry &amp; Fleet Sentinel Overview
          </h1>
          <p className="text-body-sm text-on-surface-variant">
            {summaryLoading && !summary
              ? 'Reading the latest state from the platform.'
              : `Live monitoring across ${formatNumber(totalDevices)} reporting device${totalDevices === 1 ? '' : 's'}` +
                `${p99Ms != null ? ` · p99 ingest ${p99Ms.toFixed(1)} ms` : ''}` +
                `${summary ? ` · ${formatNumber(summary.processedEvents)} readings stored` : ''}.`}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-space-sm">
          <div className="flex items-center rounded-lg bg-surface-container-low p-space-2xs shadow-sm">
            {WINDOWS.map((entry) => (
              <button
                key={entry.id}
                type="button"
                aria-pressed={windowId === entry.id}
                className={`rounded-md px-space-sm py-space-2xs font-label-md text-label-md ${
                  windowId === entry.id
                    ? 'bg-surface-container-lowest font-semibold text-primary shadow-sm'
                    : 'text-on-surface-variant hover:text-on-surface'
                }`}
                onClick={() => setWindowId(entry.id)}
              >
                {entry.label}
              </button>
            ))}
          </div>
          <button
            type="button"
            className="flex h-10 items-center gap-space-2xs rounded-lg bg-primary px-space-md font-label-md text-label-md font-semibold text-on-primary shadow-sm hover:bg-on-primary-fixed-variant"
            onClick={exportReport}
          >
            <span className="material-symbols-outlined text-[18px]" aria-hidden="true">download</span>
            Export Audit Report
          </button>
        </div>
      </section>

      {/* Top KPI telemetry banner */}
      <section className="grid grid-cols-1 gap-space-md sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          label="Ingestion Throughput"
          headerRight={
            epsTrend != null ? (
              <span
                className={`flex items-center gap-space-2xs rounded-full px-space-2xs py-0.5 font-label-sm text-label-sm ${
                  epsTrend >= 0 ? 'bg-secondary-container text-secondary' : 'bg-error-container text-error'
                }`}
              >
                <span className="material-symbols-outlined text-[14px]" aria-hidden="true">
                  {epsTrend >= 0 ? 'arrow_upward' : 'arrow_downward'}
                </span>
                {`${Math.abs(epsTrend).toFixed(1)}%`}
              </span>
            ) : null
          }
          value={
            metrics?.eventsPerSecond != null
              ? metrics.eventsPerSecond >= 10
                ? formatNumber(Math.round(metrics.eventsPerSecond))
                : metrics.eventsPerSecond.toFixed(3)
              : '—'
          }
          unit="eps"
          visual={
            metrics && metrics.eventsPerSecondTrace.length > 1 ? (
              <KpiSparkline values={metrics.eventsPerSecondTrace} label="Accepted events per second, last hour" />
            ) : null
          }
          footer={
            <span className="flex items-center gap-space-2xs">
              <span className="h-1.5 w-1.5 rounded-full bg-primary" aria-hidden="true" />
              <span className="truncate">Kafka: telemetry.events.raw</span>
            </span>
          }
          onClick={() => onNavigate('readings')}
        />

        <KpiCard
          label="P99 Latency"
          headerRight={
            p99Ms != null ? (
              <span
                className={`font-label-sm text-label-sm font-medium ${p99Ms <= 10 ? 'text-secondary' : 'text-tertiary'}`}
              >
                {p99Ms <= 10 ? 'Nominal <10ms' : 'Above 10ms budget'}
              </span>
            ) : null
          }
          value={p99Ms != null ? p99Ms.toFixed(1) : '—'}
          unit="ms"
          visual={
            metrics && metrics.p99Trace.length > 1 ? (
              <KpiSparkline values={metrics.p99Trace} label="p99 request latency, last hour" tone="secondary" />
            ) : null
          }
          footer={
            <span className="flex items-center gap-space-2xs">
              <span className="h-1.5 w-1.5 rounded-full bg-secondary" aria-hidden="true" />
              <span className="truncate">Spring Boot Ingestion Svc</span>
            </span>
          }
        />

        <KpiCard
          label="Threat Index"
          tone={criticalCount > 0 ? 'critical' : 'default'}
          headerRight={
            criticalCount > 0 ? (
              <span className="rounded-full bg-error-container px-space-2xs py-0.5 font-label-sm text-label-sm font-semibold text-on-error-container">
                ACTION REQ
              </span>
            ) : null
          }
          value={summary ? formatNumber(summary.anomalies) : '—'}
          valueSuffix={criticalCount > 0 ? `${criticalCount} Critical` : 'Flagged'}
          visual={
            criticalCount > 0 ? (
              <span className="material-symbols-outlined animate-pulse text-[28px] text-error" aria-hidden="true">
                warning
              </span>
            ) : null
          }
          footer={
            <span className="flex items-center justify-between gap-space-xs">
              <span>{traceThreshold != null ? `Threshold ${formatMeasurement(traceThreshold)}` : 'No threshold breached'}</span>
              {criticalCount > 0 ? <span className="font-medium text-error">Sigma drift alert</span> : null}
            </span>
          }
          onClick={() => onNavigate('forensics')}
        />

        <KpiCard
          label="Fleet Ratio"
          headerRight={
            <span className="font-label-sm text-label-sm font-medium text-secondary">
              {`${activeDeviceCount} / ${totalDevices} Active`}
            </span>
          }
          value={fleetRatio != null ? `${fleetRatio.toFixed(1)}%` : '—'}
          visual={fleetRatio != null ? <RingMeter percent={fleetRatio} /> : null}
          footer={
            <span className="flex items-center gap-space-2xs">
              <span className="h-1.5 w-1.5 rounded-full bg-secondary" aria-hidden="true" />
              <span className="truncate">
                {totalDevices - activeDeviceCount} quiet for over 15 minutes
              </span>
            </span>
          }
          onClick={() => onNavigate('readings')}
        />
      </section>

      {/* Main telemetry visualiser and live anomaly feed */}
      <section className="grid grid-cols-1 gap-space-lg lg:grid-cols-12">
        <div className="flex flex-col gap-space-md rounded-xl bg-surface-container-lowest p-space-lg shadow-sm lg:col-span-8">
          <div className="flex flex-wrap items-center justify-between gap-space-sm">
            <div className="flex items-center gap-space-sm">
              <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-surface-container text-primary">
                <span className="material-symbols-outlined text-[20px]" aria-hidden="true">show_chart</span>
              </span>
              <div>
                <h2 className="text-headline-md font-semibold text-on-surface">Multi-Stream Real-Time Telemetry</h2>
                <p className="text-body-sm text-on-surface-variant">
                  {traceDevices.length > 0
                    ? `Synchronised ${humanizeLabel(traceMetric).toLowerCase()} streams, aligned by recency rank: ${traceDevices
                        .map((device) => device.deviceId)
                        .join(', ')}.`
                    : 'No devices are reporting yet.'}
                </p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-space-md font-label-sm text-label-sm">
              {traceSeries.map((line, index) => (
                <span key={line.metric} className="flex items-center gap-space-2xs">
                  <span
                    className={`h-2.5 w-2.5 rounded-sm ${
                      index === 0 ? 'bg-primary' : index === 1 ? 'bg-secondary' : 'bg-tertiary'
                    }`}
                    aria-hidden="true"
                  />
                  <span className="text-on-surface">
                    {line.label} ({formatValueWithUnit(0, traceUnit).replace('0', '').trim() || traceUnit})
                  </span>
                </span>
              ))}
              {traceThreshold != null ? (
                <span className="flex items-center gap-space-2xs">
                  <span className="h-2.5 w-2.5 rounded-full bg-error" aria-hidden="true" />
                  <span className="font-medium text-error">Breach Threshold</span>
                </span>
              ) : null}
            </div>
          </div>

          {trace.loading && traceSeries.length === 0 ? (
            <TableSkeleton rows={3} columns={6} />
          ) : (
            <TelemetryTrace
              series={traceSeries}
              breaches={traceBreaches}
              threshold={traceThreshold}
              unit={traceUnit}
              onInspect={setInspected}
            />
          )}

          <div className="grid grid-cols-1 gap-space-md pt-space-2xs sm:grid-cols-3">
            {traceSeries.map((line) => {
              const values = line.points.map((point) => point.value);
              const mean = values.length > 0 ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
              const latest = values[values.length - 1] ?? null;
              const breached = traceThreshold != null && latest != null && latest >= traceThreshold;
              return (
                <div
                  key={line.metric}
                  className="flex items-center justify-between gap-space-xs rounded-lg bg-surface-container-low p-space-sm"
                >
                  <span className="flex min-w-0 flex-col">
                    <span className="truncate font-label-sm text-label-sm text-on-surface-variant">
                      {line.label} mean
                    </span>
                    <span className="font-mono text-metric-md text-on-surface">
                      {mean != null ? formatValueWithUnit(mean, traceUnit) : '—'}
                    </span>
                  </span>
                  <span
                    className={`flex-none rounded px-space-2xs py-0.5 font-mono text-code-sm ${
                      breached ? 'bg-error-container text-error' : 'bg-secondary-container text-secondary'
                    }`}
                  >
                    {breached ? 'Breached' : 'Within spec'}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        <div className="flex flex-col gap-space-md rounded-xl bg-surface-container-lowest p-space-lg shadow-sm lg:col-span-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-space-2xs">
              <span
                className={`h-2.5 w-2.5 rounded-full ${anomalyRows.length > 0 ? 'animate-ping bg-error' : 'bg-secondary'}`}
                aria-hidden="true"
              />
              <h2 className="text-headline-md font-semibold text-on-surface">Sentinel Feed</h2>
            </div>
            <span
              className={`rounded px-space-2xs py-0.5 font-label-sm text-label-sm font-medium ${
                anomalyRows.length > 0
                  ? 'bg-error-container text-on-error-container'
                  : 'bg-secondary-container text-on-secondary-container'
              }`}
            >
              {anomalyRows.length} Active
            </span>
          </div>

          <ErrorBanner error={recentAnomalies.error} onRetry={recentAnomalies.reload} />

          {recentAnomalies.loading && anomalyRows.length === 0 ? (
            <TableSkeleton rows={3} columns={2} />
          ) : (
            <SentinelFeed
              anomalies={anomalyRows.slice(0, 3)}
              sigmas={sigmas}
              unit={traceUnit}
              onInspect={setInspected}
            />
          )}

          <div className="flex items-center justify-between gap-space-xs rounded-lg bg-surface-container-low p-space-sm">
            <span className="font-label-sm text-label-sm text-on-surface-variant">Continuous Sentinel Scanning</span>
            <span className="flex items-center gap-space-2xs font-mono text-code-sm text-secondary">
              <span className={`h-2 w-2 rounded-full bg-secondary ${autoRefresh ? 'animate-pulse' : ''}`} />
              {autoRefresh ? 'Polling every 30s' : 'Paused'}
            </span>
          </div>
        </div>
      </section>

      {/* Kafka cluster and service health matrix */}
      <section className="flex flex-col gap-space-md rounded-xl bg-surface-container-lowest p-space-lg shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-space-sm">
          <div className="flex items-center gap-space-sm">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-surface-container text-primary">
              <span className="material-symbols-outlined text-[20px]" aria-hidden="true">dns</span>
            </span>
            <div>
              <h2 className="text-headline-md font-semibold text-on-surface">Kafka Cluster &amp; Service Health Matrix</h2>
              <p className="text-body-sm text-on-surface-variant">
                Actuator health and scraped Prometheus metrics. Anything this deployment does not expose to a
                browser is left as a dash rather than guessed.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-space-sm font-label-sm text-label-sm">
            <span className={`flex items-center gap-space-2xs font-medium ${allOperational ? 'text-secondary' : 'text-tertiary'}`}>
              <span
                className={`h-2 w-2 rounded-full ${allOperational ? 'animate-pulse bg-secondary' : 'bg-tertiary'}`}
                aria-hidden="true"
              />
              {allOperational ? 'All Systems Operational' : 'Partially Observable'}
            </span>
            <span className="text-outline-variant">|</span>
            <span className="font-mono text-code-sm text-on-surface-variant">
              {metrics?.queryRuntimeMs != null ? `Metrics query ${metrics.queryRuntimeMs.toFixed(0)} ms` : 'Metrics —'}
            </span>
          </div>
        </div>

        <ErrorBanner error={metricsState.error} onRetry={metricsState.reload} />
        <ClusterMatrix metrics={metrics} dataVersion={dataVersion} />
      </section>

      <section className="rounded-xl bg-surface-container-lowest p-space-lg shadow-sm">
        <div className="mb-space-lg">
          <h2 className="text-headline-md font-semibold text-on-surface">Activity</h2>
          <p className="mt-1 text-body-md text-on-surface-variant">
            How many readings arrived in each hour of the selected window.
          </p>
        </div>

        <ErrorBanner error={activity.error} onRetry={activity.reload} />

        {activity.loading && !activity.data ? (
          <TableSkeleton rows={3} columns={6} />
        ) : activity.data ? (
          <ActivityChart buckets={activity.data} />
        ) : null}
      </section>

      <section className="rounded-xl bg-surface-container-lowest p-space-lg shadow-sm">
        <div className="mb-space-lg flex flex-wrap items-start justify-between gap-space-md">
          <div>
            <h2 className="text-headline-md font-semibold text-on-surface">Devices</h2>
            <p className="mt-1 max-w-2xl text-body-md text-on-surface-variant">
              The most recently active devices, their latest reading, and how it has been moving.
            </p>
          </div>
          <Button onClick={() => onNavigate('trends')}>Compare trends</Button>
        </div>

        <ErrorBanner error={devices.error} onRetry={devices.reload} />

        {devices.loading && deviceRows.length === 0 ? (
          <TableSkeleton rows={5} columns={5} />
        ) : deviceRows.length === 0 && !devices.error ? (
          <EmptyState
            title="No devices have reported yet"
            detail="A device appears here as soon as its first reading is stored."
            action={
              <Button variant="primary" onClick={() => onNavigate('send')}>
                Send a test reading
              </Button>
            }
          />
        ) : (
          <DeviceList devices={deviceRows} trends={trends.data ?? {}} onSelect={onSelectDevice} />
        )}
      </section>

      <section className="rounded-xl bg-surface-container-lowest p-space-lg shadow-sm">
        <div className="mb-space-lg flex flex-wrap items-start justify-between gap-space-md">
          <div>
            <h2 className="text-headline-md font-semibold text-on-surface">Latest readings</h2>
            <p className="mt-1 text-body-md text-on-surface-variant">The eight most recent measurements to arrive.</p>
          </div>
          <Button onClick={() => onNavigate('readings')}>See all</Button>
        </div>

        <ErrorBanner error={recent.error} onRetry={recent.reload} />

        {recent.loading && rows.length === 0 ? (
          <TableSkeleton rows={5} columns={4} />
        ) : rows.length === 0 && !recent.error ? (
          <EmptyState
            title="Nothing has arrived yet"
            detail="Once a device reports a measurement it will show up here within a few seconds."
            action={
              <Button variant="primary" onClick={() => onNavigate('send')}>
                Send a test reading
              </Button>
            }
          />
        ) : (
          <ul className="overflow-hidden rounded-xl border border-surface-container-high">
            {rows.map((row, index) => (
              <li
                key={row.eventId}
                className={`flex flex-wrap items-center gap-space-md p-space-md ${
                  index > 0 ? 'border-t border-surface-container-high' : ''
                }`}
              >
                <span className="min-w-[120px] flex-1 font-label-md text-label-md font-semibold text-on-surface">
                  {row.deviceId}
                </span>
                <span className="min-w-[120px] flex-1 text-body-md text-on-surface-variant">
                  {humanizeLabel(row.metric)}
                </span>
                <span className="text-headline-sm font-semibold tabular-nums text-on-surface">
                  {formatValueWithUnit(row.value, row.unit)}
                </span>
                <span
                  className="min-w-[10ch] text-right text-body-sm text-on-surface-variant"
                  title={formatInstant(row.timestamp)}
                >
                  {formatRelative(row.timestamp)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {inspected ? (
        <IncidentDrawer
          breach={inspected}
          sigma={sigmas[inspected.eventId] ?? null}
          onClose={() => setInspected(null)}
          onOpenForensics={() => {
            setInspected(null);
            onNavigate('forensics');
          }}
        />
      ) : null}
    </div>
  );
}
