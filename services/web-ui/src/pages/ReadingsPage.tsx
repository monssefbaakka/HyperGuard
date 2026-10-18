import { useEffect, useMemo, useState } from 'react';
import {
  fetchActivity,
  fetchAnomalies,
  fetchDevices,
  fetchKafkaTopology,
  fetchSeries,
  fetchTelemetry,
} from '../api/client';
import type { AnomalyRecord, DeviceSummary, Facets } from '../api/types';
import { Button, Select, TextInput, toOptions } from '../components/Controls';
import { EmptyState, ErrorBanner, TableSkeleton } from '../components/Feedback';
import { JsonPreview } from '../components/JsonPreview';
import { Pagination } from '../components/Pagination';
import { Sparkline } from '../components/Sparkline';
import {
  formatInstant,
  formatMeasurement,
  formatNumber,
  formatRelative,
  formatValueWithUnit,
  humanizeConstant,
  humanizeLabel,
} from '../components/format';
import { useAsyncData, useDebounced } from '../hooks/useAsyncData';
import { zScoreAgainstHistory } from '../lib/signal';
import type { PageId } from './HomePage';

interface ReadingsPageProps {
  tenantId: string;
  facets: Facets | null;
  technical: boolean;
  dataVersion: number;
  onNavigate: (page: PageId) => void;
  onInspectRadar: (deviceId: string) => void;
}

/** Readings per node pulled to form its baseline — the window every σ and % on this page is against. */
const PROFILE_POINTS = 60;
const REFRESH_MS = 10_000;
/** The topic the pipeline consumes from; its lag is the one that decides whether readouts are current. */
const RAW_TOPIC = 'telemetry.events.raw';

type NodeStatus = 'critical' | 'spike' | 'stable' | 'optimal' | 'nominal';

interface NodeRow {
  device: DeviceSummary;
  history: number[];
  latest: number;
  /** Mean of the node's prior readings; null until it has enough history to mean anything. */
  baseline: number | null;
  deltaPct: number | null;
  sigma: number | null;
  anomaly: AnomalyRecord | null;
  status: NodeStatus;
}

const STATUS_META: Record<NodeStatus, { label: string; dot: string; chip: string; text: string }> = {
  critical: {
    label: 'Critical breach',
    dot: 'bg-error',
    chip: 'bg-error-container text-on-error-container',
    text: 'text-on-error-container',
  },
  spike: {
    label: 'Threshold spike',
    dot: 'bg-tertiary',
    chip: 'bg-tertiary-container text-on-tertiary-container',
    text: 'text-on-tertiary-container',
  },
  stable: {
    label: 'Stable',
    dot: 'bg-primary',
    chip: 'bg-primary-container text-on-primary-container',
    text: 'text-on-primary-container',
  },
  optimal: {
    label: 'Optimal',
    dot: 'bg-secondary',
    chip: 'bg-secondary-container text-on-secondary-container',
    text: 'text-on-secondary-container',
  },
  nominal: {
    label: 'Nominal',
    dot: 'bg-secondary',
    chip: 'bg-secondary-container text-on-secondary-container',
    text: 'text-on-secondary-container',
  },
};

const METRIC_ICONS: Record<string, string> = {
  temperature: 'thermostat',
  vibration: 'vibration',
  pressure: 'speed',
  level: 'water_drop',
  humidity: 'humidity_percentage',
  acoustic: 'graphic_eq',
  power: 'bolt',
  voltage: 'bolt',
  flow: 'air',
};

/**
 * Bands are on the reading's z-score against the node's own recent history, so "critical" means the
 * pipeline recorded an anomaly for it or the live value sits more than 4σ off its own baseline —
 * this deployment has no per-sensor engineering limits to compare against.
 */
function classify(sigma: number | null, hasAnomaly: boolean): NodeStatus {
  if (hasAnomaly) {
    return 'critical';
  }
  if (sigma === null) {
    return 'nominal';
  }
  const magnitude = Math.abs(sigma);
  if (magnitude >= 4) {
    return 'critical';
  }
  if (magnitude >= 2) {
    return 'spike';
  }
  if (magnitude >= 1) {
    return 'stable';
  }
  return magnitude >= 0.3 ? 'optimal' : 'nominal';
}

function mean(values: number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

/** Ingest latency spans milliseconds on live traffic and days on backfilled loads; scale the unit. */
function formatDuration(ms: number): string {
  const magnitude = Math.abs(ms);
  if (magnitude < 1000) {
    return `${formatNumber(Math.round(ms))} ms`;
  }
  if (magnitude < 60_000) {
    return `${formatMeasurement(ms / 1000)} s`;
  }
  if (magnitude < 3_600_000) {
    return `${formatMeasurement(ms / 60_000)} min`;
  }
  if (magnitude < 86_400_000) {
    return `${formatMeasurement(ms / 3_600_000)} h`;
  }
  return `${formatMeasurement(ms / 86_400_000)} d`;
}

function csvCell(value: string | number | null): string {
  if (value === null) {
    return '';
  }
  const text = String(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function downloadCsv(rows: NodeRow[]): void {
  const header = [
    'node_id',
    'device_type',
    'zone',
    'metric',
    'value',
    'unit',
    'baseline',
    'delta_pct',
    'sigma',
    'status',
    'readings',
    'last_seen',
  ];
  const body = rows.map((row) =>
    [
      row.device.deviceId,
      row.device.deviceType,
      row.device.location,
      row.device.metric,
      row.latest,
      row.device.unit,
      row.baseline,
      row.deltaPct,
      row.sigma,
      STATUS_META[row.status].label,
      row.device.readings,
      row.device.lastSeen,
    ]
      .map(csvCell)
      .join(','),
  );

  const blob = new Blob([[header.join(','), ...body].join('\n')], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `fleet-readouts-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.csv`;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function ReadingsPage({
  tenantId,
  facets,
  technical,
  dataVersion,
  onNavigate,
  onInspectRadar,
}: ReadingsPageProps) {
  const [search, setSearch] = useState('');
  const [metric, setMetric] = useState('');
  const [zone, setZone] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'critical' | 'spike' | 'nominal'>('all');
  const [sortMode, setSortMode] = useState<'deviation' | 'node' | 'recent'>('deviation');
  const [page, setPage] = useState(0);
  const [size, setSize] = useState(25);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [live, setLive] = useState(true);
  const [tick, setTick] = useState(0);

  const query = useDebounced(search).trim().toLowerCase();

  useEffect(() => {
    if (!live) {
      return;
    }
    const timer = window.setInterval(() => setTick((value) => value + 1), REFRESH_MS);
    return () => window.clearInterval(timer);
  }, [live]);

  const devicesState = useAsyncData(
    (signal) => fetchDevices({ tenantId: tenantId || undefined, limit: 200 }, signal),
    [tenantId, dataVersion, tick],
  );
  const devices = useMemo(() => devicesState.data ?? [], [devicesState.data]);
  const fleetKey = devices.map((device) => `${device.deviceId}:${device.metric}`).join('|');

  const profilesState = useAsyncData(
    async (signal) => {
      const entries = await Promise.all(
        devices.map(async (device) => {
          const series = await fetchSeries(
            {
              tenantId: tenantId || undefined,
              deviceId: device.deviceId,
              metric: device.metric,
              limit: PROFILE_POINTS,
            },
            signal,
          );
          return [device.deviceId, series.points.map((point) => Number(point.value))] as const;
        }),
      );
      return Object.fromEntries(entries) as Record<string, number[]>;
    },
    [fleetKey, tenantId, dataVersion, tick],
  );

  const anomaliesState = useAsyncData(
    (signal) =>
      fetchAnomalies(
        { tenantId: tenantId || undefined, size: 200, sort: 'timestamp', direction: 'desc' },
        signal,
      ),
    [tenantId, dataVersion, tick],
  );

  const topologyState = useAsyncData((signal) => fetchKafkaTopology(signal), [dataVersion, tick]);
  const activityState = useAsyncData(
    (signal) => fetchActivity({ tenantId: tenantId || undefined }, signal),
    [tenantId, dataVersion, tick],
  );

  const latestAnomalyByDevice = useMemo(() => {
    const index: Record<string, AnomalyRecord> = {};
    for (const anomaly of anomaliesState.data?.content ?? []) {
      if (!index[anomaly.deviceId]) {
        index[anomaly.deviceId] = anomaly;
      }
    }
    return index;
  }, [anomaliesState.data]);

  const nodes = useMemo<NodeRow[]>(() => {
    const profiles = profilesState.data ?? {};
    return devices.map((device) => {
      const history = profiles[device.deviceId] ?? [];
      const latest = history.length > 0 ? history[history.length - 1] : device.lastValue;
      const prior = history.slice(0, -1);
      const baseline = prior.length >= 2 ? mean(prior) : null;
      const sigma = prior.length >= 3 ? zScoreAgainstHistory(latest, prior) : null;
      const deltaPct =
        baseline !== null && baseline !== 0 ? ((latest - baseline) / Math.abs(baseline)) * 100 : null;
      const anomaly = latestAnomalyByDevice[device.deviceId] ?? null;
      return {
        device,
        history,
        latest,
        baseline,
        deltaPct,
        sigma,
        anomaly,
        status: classify(sigma, Boolean(anomaly)),
      };
    });
  }, [devices, profilesState.data, latestAnomalyByDevice]);

  const counts = useMemo(() => {
    let critical = 0;
    let spike = 0;
    for (const node of nodes) {
      if (node.status === 'critical') {
        critical += 1;
      } else if (node.status === 'spike') {
        spike += 1;
      }
    }
    return { total: nodes.length, critical, spike, nominal: nodes.length - critical - spike };
  }, [nodes]);

  const zones = useMemo(
    () => Array.from(new Set(devices.map((device) => device.location).filter(Boolean))).sort(),
    [devices],
  );

  const filtered = useMemo(() => {
    const matched = nodes.filter((node) => {
      if (metric && node.device.metric !== metric) {
        return false;
      }
      if (zone && node.device.location !== zone) {
        return false;
      }
      if (statusFilter === 'critical' && node.status !== 'critical') {
        return false;
      }
      if (statusFilter === 'spike' && node.status !== 'spike') {
        return false;
      }
      if (statusFilter === 'nominal' && (node.status === 'critical' || node.status === 'spike')) {
        return false;
      }
      if (!query) {
        return true;
      }
      return [node.device.deviceId, node.device.deviceType, node.device.location, node.device.metric]
        .join(' ')
        .toLowerCase()
        .includes(query);
    });

    const sorted = [...matched];
    if (sortMode === 'node') {
      sorted.sort((a, b) => a.device.deviceId.localeCompare(b.device.deviceId));
    } else if (sortMode === 'recent') {
      sorted.sort((a, b) => Date.parse(b.device.lastSeen) - Date.parse(a.device.lastSeen));
    } else {
      sorted.sort((a, b) => Math.abs(b.sigma ?? 0) - Math.abs(a.sigma ?? 0));
    }
    return sorted;
  }, [nodes, metric, zone, statusFilter, query, sortMode]);

  const pageRows = useMemo(
    () => filtered.slice(page * size, page * size + size),
    [filtered, page, size],
  );

  const selected =
    filtered.find((node) => node.device.deviceId === selectedId) ?? pageRows[0] ?? filtered[0] ?? null;

  const recordState = useAsyncData(
    (signal) => {
      if (!selected) {
        return Promise.resolve(null);
      }
      return fetchTelemetry(
        {
          tenantId: tenantId || undefined,
          deviceId: selected.device.deviceId,
          metric: selected.device.metric,
          size: 1,
          sort: 'timestamp',
          direction: 'desc',
        },
        signal,
      ).then((response) => response.content[0] ?? null);
    },
    [selected?.device.deviceId, selected?.device.metric, tenantId, dataVersion, tick],
  );

  const record = recordState.data;
  const ingestLatencyMs = record
    ? Date.parse(record.ingestedAt) - Date.parse(record.timestamp)
    : null;

  const rawTopic = topologyState.data?.topics.find((topic) => topic.name === RAW_TOPIC) ?? null;
  const consumerLag = rawTopic
    ? rawTopic.partitions.reduce((total, partition) => total + (partition.lag ?? 0), 0)
    : null;
  const ingestPeak = activityState.data?.reduce((peak, bucket) => Math.max(peak, bucket.count), 0) ?? null;

  const inSpec = counts.total > 0 ? (counts.nominal / counts.total) * 100 : null;
  const loading = devicesState.loading && devices.length === 0;
  const error = devicesState.error ?? profilesState.error ?? anomaliesState.error;

  const filtersActive = Boolean(query || metric || zone || statusFilter !== 'all');
  const resetFilters = () => {
    setSearch('');
    setMetric('');
    setZone('');
    setStatusFilter('all');
    setPage(0);
  };

  const statusChips: { key: typeof statusFilter; label: string; count: number; dot: string }[] = [
    { key: 'all', label: 'All nodes', count: counts.total, dot: 'bg-outline' },
    { key: 'critical', label: 'Critical alerts', count: counts.critical, dot: 'bg-error' },
    { key: 'spike', label: 'Warning drift', count: counts.spike, dot: 'bg-tertiary' },
    { key: 'nominal', label: 'Nominal', count: counts.nominal, dot: 'bg-secondary' },
  ];

  const sortModes: { key: typeof sortMode; icon: string; title: string }[] = [
    { key: 'deviation', icon: 'sort', title: 'Sort by deviation' },
    { key: 'node', icon: 'view_list', title: 'Sort by node id' },
    { key: 'recent', icon: 'schedule', title: 'Sort by last reported' },
  ];

  return (
    <div className="flex flex-col gap-space-lg xl:flex-row xl:items-start">
      <section className="flex min-w-0 flex-1 flex-col gap-space-lg">
        <header className="rounded-xl border border-surface-container-high bg-surface-container-lowest p-space-lg shadow-sm">
          <nav className="font-label-sm text-label-sm uppercase tracking-wider text-outline" aria-label="Breadcrumb">
            HyperGuard <span aria-hidden="true">›</span> Telemetry{' '}
            <span aria-hidden="true">›</span> <span className="text-primary">Fleet &amp; live readings</span>
          </nav>

          <div className="mt-space-sm flex flex-wrap items-start justify-between gap-space-md">
            <div className="min-w-0">
              <h2 className="font-display-lg text-display-lg font-semibold tracking-tight text-on-surface">
                Fleet Telemetry Stream &amp; Sensor Readouts
              </h2>
              <p className="mt-1 font-body-md text-body-md text-on-surface-variant">
                {formatNumber(counts.total)} reporting nodes · deviation measured against each node&rsquo;s
                last {PROFILE_POINTS} readings
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-space-sm">
              <span
                className={`inline-flex items-center gap-2 rounded-full px-3 py-1.5 font-label-md text-label-md font-semibold ${
                  live
                    ? 'bg-secondary-container text-on-secondary-container'
                    : 'bg-surface-container-high text-on-surface-variant'
                }`}
              >
                <span
                  className={`h-2 w-2 rounded-full ${live ? 'bg-secondary' : 'bg-outline'}`}
                  aria-hidden="true"
                />
                {live ? `Auto-refresh · ${REFRESH_MS / 1000}s` : 'Refresh paused'}
              </span>
              <Button
                onClick={() => setLive((value) => !value)}
                title="Pauses this view's polling of the read API. It does not stop ingestion."
              >
                {live ? 'Pause refresh' : 'Resume refresh'}
              </Button>
              <Button
                variant="primary"
                onClick={() => downloadCsv(filtered)}
                title="Downloads the rows currently matching the filters"
              >
                Export readouts (.csv)
              </Button>
            </div>
          </div>
        </header>

        <div className="rounded-xl border border-surface-container-high bg-surface-container-lowest p-space-lg shadow-sm">
          <div className="flex flex-wrap items-center gap-2">
            {statusChips.map((chip) => (
              <button
                key={chip.key}
                type="button"
                onClick={() => {
                  setStatusFilter(chip.key);
                  setPage(0);
                }}
                className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 font-label-md text-label-md font-semibold transition-colors ${
                  statusFilter === chip.key
                    ? 'border-primary bg-primary-container text-on-primary-container'
                    : 'border-outline-variant bg-surface-container-lowest text-on-surface-variant hover:bg-surface-container-low'
                }`}
              >
                <span className={`h-2 w-2 rounded-full ${chip.dot}`} aria-hidden="true" />
                {chip.label}
                <span className="tabular-nums">{formatNumber(chip.count)}</span>
              </button>
            ))}
          </div>

          <div className="mt-space-md flex flex-wrap items-center gap-space-lg font-body-sm text-body-sm text-on-surface-variant">
            <span className="inline-flex items-center gap-1.5">
              <span className="material-symbols-outlined text-[18px] text-primary" aria-hidden="true">
                sync_alt
              </span>
              Kafka consumer lag:{' '}
              <span className="font-mono text-code-sm font-semibold text-on-surface">
                {consumerLag === null ? 'unavailable' : `${formatNumber(consumerLag)} msg`}
              </span>
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="material-symbols-outlined text-[18px] text-primary" aria-hidden="true">
                bolt
              </span>
              Busiest hour (last 24 h):{' '}
              <span className="font-mono text-code-sm font-semibold text-on-surface">
                {ingestPeak === null ? 'unavailable' : `${formatNumber(ingestPeak)} readings`}
              </span>
            </span>
          </div>

          <div className="mt-space-md flex flex-wrap items-end gap-space-sm">
            <div className="relative min-w-[240px] flex-1">
              <span
                className="material-symbols-outlined pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[18px] text-outline"
                aria-hidden="true"
              >
                search
              </span>
              <div className="[&_input]:pl-10">
                <TextInput
                  value={search}
                  placeholder="Search node id, facility, zone or sensor stream…"
                  onChange={(value) => {
                    setSearch(value);
                    setPage(0);
                  }}
                />
              </div>
            </div>
            <Select
              value={metric}
              options={toOptions(facets?.metrics ?? [], humanizeLabel)}
              anyLabel="Sensor type: all"
              onChange={(value) => {
                setMetric(value);
                setPage(0);
              }}
            />
            <Select
              value={zone}
              options={toOptions(zones)}
              anyLabel="Cluster: all zones"
              onChange={(value) => {
                setZone(value);
                setPage(0);
              }}
            />
            {filtersActive ? <Button onClick={resetFilters}>Clear filters</Button> : null}
          </div>
        </div>

        <div className="rounded-xl border border-surface-container-high bg-surface-container-lowest shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-space-md border-b border-surface-container-high p-space-lg">
            <div className="flex items-baseline gap-space-sm">
              <h3 className="font-headline-sm text-headline-sm font-semibold text-on-surface">
                Active Sensor Fleet Readouts
              </h3>
              <span className="font-body-sm text-body-sm text-on-surface-variant">
                {formatNumber(pageRows.length)} of {formatNumber(filtered.length)} rendered
              </span>
            </div>
            <div className="flex items-center gap-1">
              {sortModes.map((mode) => (
                <button
                  key={mode.key}
                  type="button"
                  title={mode.title}
                  aria-label={mode.title}
                  aria-pressed={sortMode === mode.key}
                  onClick={() => setSortMode(mode.key)}
                  className={`flex h-9 w-9 items-center justify-center rounded-lg transition-colors ${
                    sortMode === mode.key
                      ? 'bg-primary-container text-on-primary-container'
                      : 'text-on-surface-variant hover:bg-surface-container-low'
                  }`}
                >
                  <span className="material-symbols-outlined text-[18px]" aria-hidden="true">
                    {mode.icon}
                  </span>
                </button>
              ))}
            </div>
          </div>

          <div className="p-space-lg pt-space-md">
            <ErrorBanner error={error} onRetry={devicesState.reload} />

            {loading ? (
              <TableSkeleton rows={6} columns={7} />
            ) : filtered.length === 0 ? (
              <EmptyState
                title={filtersActive ? 'No nodes match these filters' : 'No nodes reporting yet'}
                detail={
                  filtersActive
                    ? 'Nothing in the fleet matches this selection. Clear the filters to see every node.'
                    : 'Once a device reports a measurement its node appears here within a few seconds.'
                }
                icon={filtersActive ? '⌕' : '◌'}
                action={
                  filtersActive ? (
                    <Button variant="primary" onClick={resetFilters}>
                      Clear filters
                    </Button>
                  ) : (
                    <Button variant="primary" onClick={() => onNavigate('send')}>
                      Send a test reading
                    </Button>
                  )
                }
              />
            ) : (
              <>
                <div className="overflow-x-auto">
                  <table className="w-full border-collapse text-left">
                    <thead>
                      <tr className="border-b border-surface-container-high">
                        {['Stat', 'Node id & facility', 'Zone', 'Sensor type', 'Live telemetry', 'Deviation (σ)', 'Status'].map(
                          (header, index) => (
                            <th
                              key={header}
                              className={`px-space-sm pb-space-sm font-label-sm text-label-sm uppercase tracking-wider text-outline ${
                                index === 4 || index === 5 ? 'text-right' : ''
                              }`}
                            >
                              {header}
                            </th>
                          ),
                        )}
                      </tr>
                    </thead>
                    <tbody>
                      {pageRows.map((node) => {
                        const meta = STATUS_META[node.status];
                        const isSelected = selected?.device.deviceId === node.device.deviceId;
                        return (
                          <tr
                            key={node.device.deviceId}
                            onClick={() => setSelectedId(node.device.deviceId)}
                            className={`cursor-pointer border-b border-surface-container transition-colors ${
                              isSelected ? 'bg-primary-container/40' : 'hover:bg-surface-container-low'
                            }`}
                          >
                            <td className="px-space-sm py-space-sm">
                              <span
                                className={`block h-2.5 w-2.5 rounded-full ${meta.dot}`}
                                aria-hidden="true"
                              />
                            </td>
                            <td className="px-space-sm py-space-sm">
                              <span className="block font-headline-sm text-headline-sm font-semibold text-on-surface">
                                {humanizeConstant(node.device.deviceType)}
                              </span>
                              <span className="block font-mono text-code-sm text-on-surface-variant">
                                {node.device.deviceId}
                              </span>
                            </td>
                            <td className="px-space-sm py-space-sm">
                              <span className="inline-block rounded bg-surface-container-low px-2 py-1 font-label-sm text-label-sm text-on-surface-variant">
                                {node.device.location || '—'}
                              </span>
                            </td>
                            <td className="px-space-sm py-space-sm">
                              <span className="inline-flex items-center gap-2 font-body-md text-body-md text-on-surface-variant">
                                <span
                                  className="material-symbols-outlined text-[18px] text-primary"
                                  aria-hidden="true"
                                >
                                  {METRIC_ICONS[node.device.metric.toLowerCase()] ?? 'sensors'}
                                </span>
                                {humanizeLabel(node.device.metric)}
                              </span>
                            </td>
                            <td className="px-space-sm py-space-sm text-right">
                              <span className={`block font-mono text-metric-md font-semibold ${meta.text}`}>
                                {formatValueWithUnit(node.latest, node.device.unit)}
                              </span>
                              <span className="block font-mono text-code-sm text-outline">
                                base:{' '}
                                {node.baseline === null
                                  ? '—'
                                  : formatValueWithUnit(node.baseline, node.device.unit)}
                              </span>
                            </td>
                            <td className="px-space-sm py-space-sm text-right">
                              <span className={`block font-mono text-code-sm font-semibold ${meta.text}`}>
                                {node.deltaPct === null
                                  ? '—'
                                  : `${node.deltaPct >= 0 ? '+' : ''}${formatMeasurement(node.deltaPct)}%`}
                              </span>
                              <span className="block font-mono text-code-sm text-outline">
                                {node.sigma === null
                                  ? 'no baseline'
                                  : `${node.sigma >= 0 ? '+' : ''}${formatMeasurement(node.sigma)}σ`}
                              </span>
                            </td>
                            <td className="px-space-sm py-space-sm">
                              <span
                                className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 font-label-sm text-label-sm font-semibold ${meta.chip}`}
                                title={
                                  node.anomaly
                                    ? `Anomaly recorded ${formatRelative(node.anomaly.timestamp)}: ${formatValueWithUnit(
                                        node.anomaly.value,
                                        node.device.unit,
                                      )} against a threshold of ${formatMeasurement(node.anomaly.threshold)} (${humanizeConstant(
                                        node.anomaly.severity,
                                      )})`
                                    : node.sigma === null
                                      ? 'Not enough history to score this node yet'
                                      : `Latest reading sits ${formatMeasurement(Math.abs(node.sigma))}σ from this node's own recent baseline`
                                }
                              >
                                {node.status === 'critical' ? (
                                  <span className="material-symbols-outlined text-[14px]" aria-hidden="true">
                                    warning
                                  </span>
                                ) : null}
                                {meta.label}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                <Pagination
                  page={page}
                  size={size}
                  totalElements={filtered.length}
                  totalPages={Math.max(1, Math.ceil(filtered.length / size))}
                  hasNext={(page + 1) * size < filtered.length}
                  noun="node"
                  onPageChange={setPage}
                  onSizeChange={(value) => {
                    setSize(value);
                    setPage(0);
                  }}
                />
              </>
            )}
          </div>
        </div>
      </section>

      <aside className="flex w-full flex-none flex-col gap-space-lg xl:w-[380px]">
        <div className="rounded-xl border border-surface-container-high bg-surface-container-lowest p-space-lg shadow-sm">
          <p className="font-label-sm text-label-sm uppercase tracking-wider text-primary">
            Sensor reading inspector
          </p>

          {selected ? (
            <>
              <h3 className="mt-1 font-headline-md text-headline-md font-semibold text-on-surface">
                {humanizeConstant(selected.device.deviceType)}
              </h3>
              <p className="font-body-sm text-body-sm text-on-surface-variant">
                Node ID: <span className="font-mono text-code-sm">{selected.device.deviceId}</span>
              </p>

              <dl className="mt-space-md grid grid-cols-2 gap-3 rounded-lg bg-surface-container-low p-space-sm">
                <div>
                  <dt className="font-label-sm text-label-sm uppercase tracking-wider text-outline">
                    Ingest latency
                  </dt>
                  <dd className="font-mono text-code-sm text-on-surface">
                    {ingestLatencyMs === null ? '—' : formatDuration(ingestLatencyMs)}
                  </dd>
                </div>
                <div>
                  <dt className="font-label-sm text-label-sm uppercase tracking-wider text-outline">
                    Readings stored
                  </dt>
                  <dd className="font-mono text-code-sm text-on-surface">
                    {formatNumber(selected.device.readings)}
                  </dd>
                </div>
                <div>
                  <dt className="font-label-sm text-label-sm uppercase tracking-wider text-outline">
                    Pipeline topic
                  </dt>
                  <dd className="font-mono text-code-sm text-on-surface">{RAW_TOPIC}</dd>
                </div>
                <div>
                  <dt className="font-label-sm text-label-sm uppercase tracking-wider text-outline">
                    Partitions
                  </dt>
                  <dd className="font-mono text-code-sm text-on-surface">
                    {rawTopic ? formatNumber(rawTopic.partitionCount) : '—'}
                  </dd>
                </div>
                {technical && record ? (
                  <>
                    <div>
                      <dt className="font-label-sm text-label-sm uppercase tracking-wider text-outline">
                        Event type
                      </dt>
                      <dd className="font-mono text-code-sm text-on-surface">{record.eventType}</dd>
                    </div>
                    <div>
                      <dt className="font-label-sm text-label-sm uppercase tracking-wider text-outline">
                        Tenant
                      </dt>
                      <dd className="font-mono text-code-sm text-on-surface">{record.tenantId}</dd>
                    </div>
                  </>
                ) : null}
              </dl>

              <div className="mt-space-md">
                <div className="flex items-baseline justify-between gap-2">
                  <p className="font-label-sm text-label-sm text-on-surface-variant">
                    Rolling profile · last {formatNumber(selected.history.length)} readings
                  </p>
                  <span className={`font-mono text-code-sm font-semibold ${STATUS_META[selected.status].text}`}>
                    {selected.deltaPct === null
                      ? '—'
                      : `${selected.deltaPct >= 0 ? '+' : ''}${formatMeasurement(selected.deltaPct)}% vs baseline`}
                  </span>
                </div>
                {selected.history.length >= 2 ? (
                  <Sparkline
                    width={330}
                    height={62}
                    values={selected.history}
                    label={`Recent ${humanizeLabel(selected.device.metric).toLowerCase()} for ${selected.device.deviceId}`}
                  />
                ) : (
                  <p className="font-body-sm text-body-sm text-on-surface-variant">
                    Not enough history to plot yet.
                  </p>
                )}
                <p
                  className="mt-1 font-body-sm text-body-sm text-outline"
                  title={formatInstant(selected.device.lastSeen)}
                >
                  Last reported {formatRelative(selected.device.lastSeen)}
                </p>
              </div>

              <div className="mt-space-md">
                <p className="mb-1 font-label-sm text-label-sm text-on-surface-variant">
                  Raw event envelope
                </p>
                {record ? (
                  <JsonPreview value={record} />
                ) : (
                  <p className="font-body-sm text-body-sm text-on-surface-variant">
                    {recordState.loading ? 'Loading the latest event…' : 'No stored event for this node.'}
                  </p>
                )}
              </div>

              <div className="mt-space-md flex flex-col gap-2 border-t border-surface-container-high pt-space-md">
                <Button variant="primary" onClick={() => onInspectRadar(selected.device.deviceId)}>
                  Spectral Radar
                </Button>
                <Button title="Not wired to a control-plane API in this deployment" disabled>
                  Quarantine node
                </Button>
              </div>
            </>
          ) : (
            <p className="mt-space-sm font-body-md text-body-md text-on-surface-variant">
              Select a node in the fleet table to inspect its rolling profile and its latest stored event.
            </p>
          )}
        </div>

        <div className="rounded-xl border border-surface-container-high bg-surface-container-lowest p-space-lg shadow-sm">
          <div className="flex items-center justify-between gap-space-sm">
            <h3 className="font-headline-sm text-headline-sm font-semibold text-on-surface">
              Sensor Array Health
            </h3>
            <span className="inline-flex items-center gap-1.5 font-label-md text-label-md font-semibold text-on-secondary-container">
              <span className="material-symbols-outlined text-[16px]" aria-hidden="true">
                check_circle
              </span>
              {inSpec === null ? '—' : `${formatMeasurement(inSpec)}% in-spec`}
            </span>
          </div>

          <div className="mt-space-sm flex h-2 overflow-hidden rounded-full bg-surface-container-high">
            {counts.total > 0 ? (
              <>
                <span
                  className="bg-secondary"
                  style={{ width: `${(counts.nominal / counts.total) * 100}%` }}
                  aria-hidden="true"
                />
                <span
                  className="bg-tertiary"
                  style={{ width: `${(counts.spike / counts.total) * 100}%` }}
                  aria-hidden="true"
                />
                <span
                  className="bg-error"
                  style={{ width: `${(counts.critical / counts.total) * 100}%` }}
                  aria-hidden="true"
                />
              </>
            ) : null}
          </div>

          <div className="mt-space-sm flex flex-wrap gap-space-md font-body-sm text-body-sm text-on-surface-variant">
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-secondary" aria-hidden="true" />
              {formatNumber(counts.nominal)} nominal
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-tertiary" aria-hidden="true" />
              {formatNumber(counts.spike)} drift
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-error" aria-hidden="true" />
              {formatNumber(counts.critical)} critical
            </span>
          </div>

          <p className="mt-space-sm font-body-sm text-body-sm text-outline">
            In-spec counts every node whose latest reading sits within 2σ of its own recent history and
            carries no recorded anomaly.
          </p>
        </div>
      </aside>
    </div>
  );
}
