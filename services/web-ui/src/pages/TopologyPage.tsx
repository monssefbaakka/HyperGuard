import { useEffect, useRef, useState } from 'react';
import { fetchKafkaTopology } from '../api/client';
import type { KafkaTopology, Summary } from '../api/types';
import { ErrorBanner, TableSkeleton } from '../components/Feedback';
import { formatNumber } from '../components/format';
import { useAsyncData, type AsyncState } from '../hooks/useAsyncData';
import type { PlatformMetrics } from '../hooks/usePlatformMetrics';
import type { PageId } from './HomePage';

interface TopologyPageProps {
  dataVersion: number;
  summary: Summary | null;
  metricsState: AsyncState<PlatformMetrics>;
  onNavigate: (page: PageId) => void;
}

const RAW_TOPIC = 'telemetry.events.raw';
const DLQ_TOPIC = 'telemetry.events.dlq';

/** Colour a topic by the channel it carries, matching the DAG legend. */
function topicTone(name: string): 'nominal' | 'anomaly' | 'analytical' {
  if (name.includes('anomalies') || name.includes('dlq')) {
    return 'anomaly';
  }
  if (name.includes('processed')) {
    return 'analytical';
  }
  return 'nominal';
}

const TOPIC_TEXT: Record<ReturnType<typeof topicTone>, string> = {
  nominal: 'text-primary',
  anomaly: 'text-error',
  analytical: 'text-secondary',
};

interface StatCardProps {
  label: string;
  value: string;
  unit?: string;
  note: string;
  /** 0-100; drives the bar under the figure. */
  fill: number;
  tone?: 'primary' | 'secondary' | 'error';
}

function StatCard({ label, value, unit, note, fill, tone = 'primary' }: StatCardProps) {
  const bar = tone === 'error' ? 'bg-error' : tone === 'secondary' ? 'bg-secondary' : 'bg-primary';
  return (
    <div className="flex flex-col gap-space-xs rounded-xl bg-surface-container-lowest p-space-lg shadow-sm ring-1 ring-surface-container-high/60">
      <span className="font-label-sm text-label-sm uppercase tracking-wider text-on-surface-variant">{label}</span>
      <span className="flex items-baseline gap-1.5">
        <span className={`font-mono text-metric-xl font-semibold tabular-nums ${tone === 'error' ? 'text-error' : 'text-on-surface'}`}>
          {value}
        </span>
        {unit ? <span className="font-mono text-code-sm text-on-surface-variant">{unit}</span> : null}
        <span className="font-label-sm text-label-sm text-on-surface-variant">{note}</span>
      </span>
      <div className="h-1 w-full overflow-hidden rounded-full bg-surface-container-high">
        <div className={`h-1 rounded-full ${bar}`} style={{ width: `${Math.max(0, Math.min(100, fill))}%` }} />
      </div>
    </div>
  );
}

function DagNode({
  title,
  subtitle,
  chips,
  tone = 'default',
}: {
  title: string;
  subtitle: string;
  chips: { text: string; tone?: 'primary' | 'secondary' | 'error' | 'muted' }[];
  tone?: 'default' | 'accent';
}) {
  const chipClass = {
    primary: 'bg-primary-container text-on-primary-container',
    secondary: 'bg-secondary-container text-on-secondary-container',
    error: 'bg-error-container text-on-error-container',
    muted: 'bg-surface-container text-on-surface-variant',
  };
  return (
    <div
      className={`flex min-w-[168px] flex-col gap-space-2xs rounded-lg bg-surface-container-lowest p-space-sm shadow-sm ${
        tone === 'accent' ? 'border-l-4 border-primary' : 'border-l-4 border-surface-container-high'
      }`}
    >
      <span className="text-body-md font-semibold text-on-surface">{title}</span>
      <span className="font-label-sm text-label-sm text-on-surface-variant">{subtitle}</span>
      {chips.map((chip) => (
        <span
          key={chip.text}
          className={`w-fit rounded px-space-2xs py-0.5 font-mono text-code-sm ${chipClass[chip.tone ?? 'muted']}`}
        >
          {chip.text}
        </span>
      ))}
    </div>
  );
}

/**
 * The streaming tier as the broker itself reports it: real topics, partitions, leaders, replication,
 * committed offsets and consumer-group lag from Kafka's AdminClient, plus scraped service metrics.
 * Per-partition throughput is measured here, by differencing successive offset readings.
 */
export function TopologyPage({ dataVersion, summary, metricsState, onNavigate }: TopologyPageProps) {
  const [filter, setFilter] = useState('');

  const topologyState = useAsyncData<KafkaTopology>((signal) => fetchKafkaTopology(signal), [dataVersion]);
  const topology = topologyState.data;
  const metrics = metricsState.data;

  /*
   * Throughput is not something the broker reports; it is derived here from how far each partition's
   * end offset moved between two polls. The snapshot is taken in an effect rather than during render
   * because recording it is a side effect — under StrictMode a render-time write is replayed, and the
   * second pass would compare a snapshot against itself and read as a flat zero.
   */
  const previous = useRef<{ at: number; offsets: Record<string, number> } | null>(null);
  const [throughput, setThroughput] = useState<Record<string, number>>({});

  useEffect(() => {
    if (!topology?.available) {
      return;
    }

    const now = Date.now();
    const offsets: Record<string, number> = {};
    for (const topic of topology.topics) {
      for (const partition of topic.partitions) {
        offsets[`${topic.name}/${partition.partition}`] = partition.endOffset;
      }
    }

    const before = previous.current;
    const elapsedSeconds = before ? (now - before.at) / 1000 : 0;

    // A sub-second gap is a repeated render, not a new measurement window.
    if (!before || elapsedSeconds < 1) {
      previous.current = before ?? { at: now, offsets };
      return;
    }

    previous.current = { at: now, offsets };
    const rates: Record<string, number> = {};
    for (const [key, endOffset] of Object.entries(offsets)) {
      const priorOffset = before.offsets[key];
      if (priorOffset !== undefined) {
        rates[key] = Math.max(0, endOffset - priorOffset) / elapsedSeconds;
      }
    }
    setThroughput(rates);
  }, [topology]);

  const topics = topology?.topics ?? [];
  const totalPartitions = topics.reduce((sum, topic) => sum + topic.partitionCount, 0);
  const inSyncPartitions = topics.reduce(
    (sum, topic) => sum + topic.partitions.filter((partition) => partition.inSyncCount === partition.replicaCount).length,
    0,
  );
  const isrPercent = totalPartitions > 0 ? (inSyncPartitions / totalPartitions) * 100 : 0;
  const replicationFactor = topics[0]?.replicationFactor ?? 0;

  const lags = topics.flatMap((topic) => topic.partitions.map((partition) => partition.lag)).filter(
    (lag): lag is number => lag !== null,
  );
  const maxLag = lags.length > 0 ? Math.max(...lags) : null;

  const dlqDepth = topics.find((topic) => topic.name === DLQ_TOPIC)?.partitions.reduce(
    (sum, partition) => sum + partition.endOffset,
    0,
  );
  const ingressRecordsPerSecond = Object.entries(throughput)
    .filter(([key]) => key.startsWith(`${RAW_TOPIC}/`))
    .reduce((sum, [, rate]) => sum + rate, 0);
  const measuredThroughput = Object.keys(throughput).length > 0;

  const p99Ms = metrics?.p99Seconds != null ? metrics.p99Seconds * 1000 : null;

  const rows = topics
    .flatMap((topic) => topic.partitions.map((partition) => ({ topic, partition })))
    .filter(({ topic, partition }) => {
      const needle = filter.trim().toLowerCase();
      return needle === '' || topic.name.toLowerCase().includes(needle) || `p-${partition.partition}`.includes(needle);
    });

  return (
    <div className="flex flex-col gap-space-xl">
      {/* Header and cluster actions */}
      <section className="flex flex-col justify-between gap-space-md rounded-xl bg-surface-container-lowest p-space-lg shadow-sm md:flex-row md:items-start">
        <div className="flex flex-col gap-space-2xs">
          <div className="flex items-center gap-space-2xs font-label-sm text-label-sm uppercase tracking-wider text-on-surface-variant">
            <span>HyperGuard</span>
            <span className="material-symbols-outlined text-[14px]" aria-hidden="true">chevron_right</span>
            <span>Architecture</span>
            <span className="material-symbols-outlined text-[14px]" aria-hidden="true">chevron_right</span>
            <span className="font-medium text-primary">Topology Pipeline</span>
          </div>
          <h1 className="max-w-2xl text-display-lg font-semibold tracking-tight text-on-surface">
            Distributed Stream Processing &amp; Event Flow Architecture
          </h1>
          <p className="max-w-2xl text-body-sm text-on-surface-variant">
            Live view of edge ingress, Kafka cluster partitions, consumer-group offsets and the persistence tier —
            read from the broker's own AdminClient, not drawn from configuration.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-space-sm">
          <span
            className={`flex items-center gap-space-2xs rounded-full px-space-sm py-1 font-label-sm text-label-sm font-semibold ${
              maxLag === 0
                ? 'bg-secondary-container text-on-secondary-container'
                : maxLag == null
                  ? 'bg-surface-container text-on-surface-variant'
                  : 'bg-tertiary-container text-on-tertiary-container'
            }`}
          >
            <span className="h-2 w-2 rounded-full bg-current" aria-hidden="true" />
            {maxLag == null ? 'NO COMMITTED OFFSETS' : `HEALTHY (MAX LAG: ${formatNumber(maxLag)})`}
          </span>
          <span className="flex items-center gap-space-2xs rounded-full bg-surface-container px-space-sm py-1 font-label-sm text-label-sm text-on-surface-variant">
            <span className="material-symbols-outlined text-[16px]" aria-hidden="true">lan</span>
            Replication: {replicationFactor}x
          </span>
          <button
            type="button"
            disabled
            title="Read-only console: the topology API describes the cluster but has no endpoint that triggers a consumer-group rebalance."
            className="flex h-10 items-center gap-space-2xs rounded-lg bg-primary px-space-md font-label-md text-label-md font-semibold text-on-primary shadow-sm disabled:cursor-not-allowed disabled:opacity-45"
          >
            <span className="material-symbols-outlined text-[18px]" aria-hidden="true">sync_alt</span>
            Rebalance Consumer Groups
          </button>
        </div>
      </section>

      <ErrorBanner error={topologyState.error} onRetry={topologyState.reload} />

      {topology && !topology.available ? (
        <section className="rounded-xl bg-tertiary-container p-space-lg text-body-md text-on-tertiary-container">
          The Kafka cluster did not answer, so no partition or offset figures are shown.
          {topology.error ? <span className="ml-1 font-mono text-code-sm">({topology.error})</span> : null}
        </section>
      ) : null}

      {/* Cluster headline figures */}
      <section className="grid grid-cols-1 gap-space-md sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Total Active Partitions"
          value={topology?.available ? String(totalPartitions) : '—'}
          note={topology?.available ? `${isrPercent.toFixed(0)}% in sync (ISR)` : ''}
          fill={isrPercent}
          tone="secondary"
        />
        <StatCard
          label="Cluster Ingress Velocity"
          value={measuredThroughput ? ingressRecordsPerSecond.toFixed(2) : '—'}
          unit="rec/s"
          note={measuredThroughput ? 'raw topic, measured between polls' : 'awaiting a second poll'}
          fill={Math.min(100, ingressRecordsPerSecond * 20)}
        />
        <StatCard
          label="Ingest P99 Latency"
          value={p99Ms != null ? p99Ms.toFixed(2) : '—'}
          unit="ms"
          note="HTTP publish, scraped"
          fill={p99Ms != null ? Math.min(100, (p99Ms / 200) * 100) : 0}
          tone="secondary"
        />
        <StatCard
          label="DLQ Messages"
          value={dlqDepth != null ? formatNumber(dlqDepth) : '—'}
          note={dlqDepth === 0 ? 'safe state' : 'quarantined payloads'}
          fill={dlqDepth === 0 ? 100 : 30}
          tone={dlqDepth && dlqDepth > 0 ? 'error' : 'secondary'}
        />
      </section>

      {/* End-to-end pipeline */}
      <section className="flex flex-col gap-space-md rounded-xl bg-surface-container-lowest p-space-lg shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-space-sm">
          <div className="flex items-center gap-space-sm">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-surface-container text-primary">
              <span className="material-symbols-outlined text-[20px]" aria-hidden="true">account_tree</span>
            </span>
            <div>
              <h2 className="text-headline-md font-semibold text-on-surface">End-to-End Pipeline</h2>
              <p className="text-body-sm text-on-surface-variant">
                Devices → ingestion-service → Kafka → telemetry-processor → PostgreSQL, with the query service
                serving this console.
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-space-md font-label-sm text-label-sm">
            {[
              { label: 'Nominal telemetry', dot: 'bg-primary' },
              { label: 'Anomaly & DLQ channel', dot: 'bg-error' },
              { label: 'Analytical queries', dot: 'bg-secondary' },
            ].map((entry) => (
              <span key={entry.label} className="flex items-center gap-space-2xs text-on-surface-variant">
                <span className={`h-2 w-2 rounded-full ${entry.dot}`} aria-hidden="true" />
                {entry.label}
              </span>
            ))}
          </div>
        </div>

        <div className="overflow-x-auto rounded-lg bg-surface-container-low p-space-lg">
          <div className="flex min-w-[900px] items-stretch gap-space-sm">
            <DagNode
              title="Edge devices"
              subtitle="Sensors publishing readings"
              chips={[
                { text: `${summary ? formatNumber(summary.devices) : '—'} devices`, tone: 'muted' },
                {
                  text: metrics?.eventsPerSecond != null ? `${metrics.eventsPerSecond.toFixed(3)} eps` : '— eps',
                  tone: 'primary',
                },
              ]}
            />
            <span className="flex items-center text-outline" aria-hidden="true">
              <span className="material-symbols-outlined">arrow_forward</span>
            </span>

            <DagNode
              title="Ingestion service"
              subtitle="Spring Boot · validates & publishes"
              tone="accent"
              chips={[
                { text: 'HTTP :8081', tone: 'primary' },
                {
                  text:
                    metrics?.kafkaPublishSeconds != null
                      ? `publish ${(metrics.kafkaPublishSeconds * 1000).toFixed(1)}ms`
                      : 'publish —',
                  tone: 'muted',
                },
                { text: 'acks=all · retries=3', tone: 'muted' },
              ]}
            />
            <span className="flex items-center text-outline" aria-hidden="true">
              <span className="material-symbols-outlined">arrow_forward</span>
            </span>

            <div className="flex min-w-[260px] flex-col gap-space-2xs rounded-lg bg-surface-container-lowest p-space-sm shadow-sm">
              <span className="font-label-sm text-label-sm uppercase tracking-wider text-on-surface-variant">
                Kafka cluster ({topology?.brokerCount ?? '—'}x broker)
              </span>
              {topics.map((topic) => {
                const lag = topic.partitions.reduce<number | null>(
                  (worst, partition) => (partition.lag == null ? worst : Math.max(worst ?? 0, partition.lag)),
                  null,
                );
                return (
                  <div key={topic.name} className="rounded bg-surface-container-low p-space-2xs">
                    <div className={`font-mono text-code-sm font-medium ${TOPIC_TEXT[topicTone(topic.name)]}`}>
                      {topic.name}
                    </div>
                    <div className="font-mono text-code-sm text-on-surface-variant">
                      P: {topic.partitionCount} | Rep: {topic.replicationFactor}
                      {lag != null ? ` | Lag: ${formatNumber(lag)}` : ''}
                    </div>
                  </div>
                );
              })}
              {topics.length === 0 ? (
                <span className="font-mono text-code-sm text-on-surface-variant">No topics described.</span>
              ) : null}
            </div>
            <span className="flex items-center text-outline" aria-hidden="true">
              <span className="material-symbols-outlined">arrow_forward</span>
            </span>

            <DagNode
              title="Telemetry processor"
              subtitle="Spring Kafka consumer"
              tone="accent"
              chips={[
                { text: `group ${topology?.primaryGroup ?? '—'}`, tone: 'primary' },
                {
                  text: (() => {
                    const group = topology?.consumerGroups.find((entry) => entry.groupId === topology?.primaryGroup);
                    return group ? `${group.state} · ${group.memberCount} member(s)` : 'no group state';
                  })(),
                  tone: 'muted',
                },
                { text: 'HTTP :8082 · mgmt :9083', tone: 'muted' },
              ]}
            />
            <span className="flex items-center text-outline" aria-hidden="true">
              <span className="material-symbols-outlined">arrow_forward</span>
            </span>

            <div className="flex min-w-[190px] flex-col gap-space-xs">
              <DagNode
                title="PostgreSQL"
                subtitle="Readings & anomalies"
                chips={[
                  { text: summary ? `${formatNumber(summary.processedEvents)} rows` : '— rows', tone: 'secondary' },
                  {
                    text:
                      metrics?.poolActive != null && metrics?.poolMax != null
                        ? `pool ${metrics.poolActive}/${metrics.poolMax}`
                        : 'pool —',
                    tone: 'muted',
                  },
                ]}
              />
              <DagNode
                title="Query service"
                subtitle="Serves this console"
                chips={[{ text: 'HTTP :8083', tone: 'secondary' }]}
              />
              <DagNode
                title="Redis"
                subtitle="Provisioned, not in the path"
                chips={[{ text: 'unused', tone: 'muted' }]}
              />
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-space-md rounded-lg bg-primary-container/40 px-space-md py-space-sm font-mono text-code-sm text-on-surface-variant">
          <span className="font-label-sm text-label-sm uppercase tracking-wider">Observability fabric:</span>
          <span>Prometheus /actuator/prometheus (15s scrape)</span>
          <span>Grafana dashboards</span>
          <span>OpenTelemetry → Jaeger</span>
          <span className="text-on-surface">
            {metrics?.targetsUp != null && metrics?.targetsTotal != null
              ? `${metrics.targetsUp}/${metrics.targetsTotal} targets up`
              : 'targets —'}
          </span>
        </div>
      </section>

      {/* Partition matrix and DLQ inspector */}
      <section className="grid grid-cols-1 gap-space-lg lg:grid-cols-12">
        <div className="flex flex-col gap-space-md rounded-xl bg-surface-container-lowest p-space-lg shadow-sm lg:col-span-8">
          <div className="flex flex-wrap items-center justify-between gap-space-sm">
            <div className="flex items-center gap-space-sm">
              <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-surface-container text-primary">
                <span className="material-symbols-outlined text-[20px]" aria-hidden="true">table_rows</span>
              </span>
              <h2 className="text-headline-md font-semibold text-on-surface">Partition &amp; Consumer Group Matrix</h2>
            </div>
            <div className="flex items-center gap-space-sm">
              <input
                className="h-9 w-[200px] rounded-lg border border-outline-variant bg-surface-container-lowest px-3 text-body-sm text-on-surface focus:border-primary focus:outline-none"
                placeholder="Filter topic or partition..."
                value={filter}
                onChange={(event) => setFilter(event.target.value)}
              />
              <span className="rounded bg-secondary-container px-space-xs py-0.5 font-label-sm text-label-sm font-medium text-on-secondary-container">
                {rows.length} shown
              </span>
            </div>
          </div>

          {topologyState.loading && !topology ? (
            <TableSkeleton rows={5} columns={6} />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] border-collapse">
                <thead>
                  <tr className="border-b border-surface-container-high text-left font-label-sm text-label-sm uppercase tracking-wider text-on-surface-variant">
                    <th className="py-space-xs pr-space-sm font-medium">Topic identity</th>
                    <th className="py-space-xs pr-space-sm font-medium">Partition</th>
                    <th className="py-space-xs pr-space-sm font-medium">Leader broker</th>
                    <th className="py-space-xs pr-space-sm text-right font-medium">Committed offset</th>
                    <th className="py-space-xs pr-space-sm text-right font-medium">Lag</th>
                    <th className="py-space-xs text-right font-medium">Throughput</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map(({ topic, partition }) => {
                    const rate = throughput[`${topic.name}/${partition.partition}`];
                    return (
                      <tr key={`${topic.name}-${partition.partition}`} className="border-b border-surface-container-high/60">
                        <td className={`py-space-sm pr-space-sm font-mono text-code-sm ${TOPIC_TEXT[topicTone(topic.name)]}`}>
                          {topic.name}
                        </td>
                        <td className="py-space-sm pr-space-sm font-mono text-code-sm text-on-surface-variant">
                          p-{partition.partition}
                        </td>
                        <td className="py-space-sm pr-space-sm font-mono text-code-sm text-on-surface-variant">
                          <span className="flex items-center gap-space-2xs">
                            <span
                              className={`h-2 w-2 rounded-full ${
                                partition.inSyncCount === partition.replicaCount ? 'bg-secondary' : 'bg-tertiary'
                              }`}
                              aria-hidden="true"
                            />
                            {partition.leader}
                          </span>
                        </td>
                        <td className="py-space-sm pr-space-sm text-right font-mono text-code-sm text-on-surface">
                          {partition.committedOffset != null ? formatNumber(partition.committedOffset) : '—'}
                        </td>
                        <td className="py-space-sm pr-space-sm text-right">
                          <span
                            className={`rounded px-space-2xs py-0.5 font-mono text-code-sm ${
                              partition.lag == null
                                ? 'bg-surface-container text-on-surface-variant'
                                : partition.lag === 0
                                  ? 'bg-secondary-container text-on-secondary-container'
                                  : 'bg-tertiary-container text-on-tertiary-container'
                            }`}
                            title={partition.lag == null ? `${topology?.primaryGroup} does not consume this topic` : undefined}
                          >
                            {partition.lag == null ? 'n/a' : formatNumber(partition.lag)}
                          </span>
                        </td>
                        <td className="py-space-sm text-right font-mono text-code-sm text-on-surface-variant">
                          {rate != null ? `${rate.toFixed(2)} rec/s` : '—'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          <p className="font-mono text-code-sm text-on-surface-variant">
            Offsets and lag are for consumer group{' '}
            <span className="text-primary">{topology?.primaryGroup ?? '—'}</span>
            {topology?.clusterId ? (
              <>
                {' · cluster '}
                <span className="text-secondary">{topology.clusterId}</span>
              </>
            ) : null}
            . Topics that group does not subscribe to show no lag rather than a zero.
          </p>
        </div>

        <div className="flex flex-col gap-space-md rounded-xl bg-surface-container-lowest p-space-lg shadow-sm lg:col-span-4">
          <div className="flex items-start justify-between gap-space-sm">
            <div className="flex items-center gap-space-sm">
              <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-error-container text-error">
                <span className="material-symbols-outlined text-[20px]" aria-hidden="true">report</span>
              </span>
              <h2 className="text-headline-md font-semibold text-on-surface">DLQ Inspector</h2>
            </div>
            <span className="rounded bg-surface-container px-space-xs py-0.5 font-mono text-code-sm text-on-surface-variant">
              {DLQ_TOPIC}
            </span>
          </div>

          <p className="text-body-sm text-on-surface-variant">
            Events the processor could not deserialise or handle are routed here instead of blocking the main
            consumer group.
          </p>

          <div className="flex flex-col items-center gap-space-2xs rounded-lg bg-surface-container-low p-space-md text-center">
            <span
              className={`material-symbols-outlined text-[32px] ${dlqDepth === 0 ? 'text-secondary' : 'text-error'}`}
              aria-hidden="true"
            >
              {dlqDepth === 0 ? 'check_circle' : 'warning'}
            </span>
            <span className="text-headline-sm font-semibold text-on-surface">
              {dlqDepth == null ? 'Depth unknown' : dlqDepth === 0 ? 'Queue empty' : `${formatNumber(dlqDepth)} quarantined`}
            </span>
            <span className="text-body-sm text-on-surface-variant">
              {dlqDepth == null
                ? 'The broker did not answer, so the DLQ depth is not known.'
                : `End offset of ${DLQ_TOPIC} across ${
                    topics.find((topic) => topic.name === DLQ_TOPIC)?.partitionCount ?? 0
                  } partition(s).`}
            </span>
          </div>

          <dl className="flex flex-col gap-space-2xs font-mono text-code-sm">
            {[
              ['Producer retries', '3 (delivery timeout 30s)'],
              ['Replay group', 'telemetry-processor-dlq-replay'],
              ['Replay idle timeout', '30s'],
              ['Replay trigger', 'Actuator dlqreplay (loopback only)'],
            ].map(([label, value]) => (
              <div key={label} className="flex justify-between gap-space-sm text-on-surface-variant">
                <dt>{label}</dt>
                <dd className="text-right text-on-surface">{value}</dd>
              </div>
            ))}
          </dl>

          <button
            type="button"
            className="h-10 rounded-lg bg-surface-container px-space-md font-label-md text-label-md font-semibold text-on-surface hover:bg-surface-container-high"
            onClick={() => onNavigate('send')}
          >
            Publish a test event
          </button>
        </div>
      </section>

      {/* Real behaviour of the pipeline, from the services' own configuration */}
      <section className="grid grid-cols-1 gap-space-lg lg:grid-cols-3">
        {[
          {
            eyebrow: 'Delivery guarantees',
            title: 'Producer acknowledgement',
            body: 'Publishes wait for all in-sync replicas before the ingestion API answers, so an accepted reading is durable on the broker.',
            stats: [
              ['Acknowledgements', 'all'],
              ['Retries', '3'],
              ['Publish timeout', '5s'],
              ['Delivery timeout', '30s'],
            ],
          },
          {
            eyebrow: 'Consumption',
            title: 'Offset commit strategy',
            body: 'The processor acknowledges each record individually and starts from the earliest offset on a fresh group, so a restart replays rather than skips.',
            stats: [
              ['Ack mode', 'RECORD'],
              ['Auto offset reset', 'earliest'],
              ['Concurrency', '1'],
              ['Group', topology?.primaryGroup ?? 'telemetry-processor'],
            ],
          },
          {
            eyebrow: 'Heuristic detection',
            title: 'Threshold & spike rules',
            body: 'Anomalies are flagged by fixed bounds and a relative change test against the previous reading for the same device — plain rules, no trained model.',
            stats: [
              ['Max temperature', '80'],
              ['Min temperature', '-40'],
              ['Spike ratio', '> 50% change'],
              ['Anomaly topic', 'telemetry.events.anomalies'],
            ],
          },
        ].map((card) => (
          <div key={card.title} className="flex flex-col gap-space-sm rounded-xl bg-surface-container-lowest p-space-lg shadow-sm">
            <span className="font-label-sm text-label-sm uppercase tracking-wider text-on-surface-variant">
              {card.eyebrow}
            </span>
            <h3 className="text-headline-sm font-semibold text-on-surface">{card.title}</h3>
            <p className="text-body-sm text-on-surface-variant">{card.body}</p>
            <dl className="flex flex-col gap-space-2xs rounded-lg bg-surface-container-low p-space-sm font-mono text-code-sm">
              {card.stats.map(([label, value]) => (
                <div key={label} className="flex justify-between gap-space-sm text-on-surface-variant">
                  <dt>{label}</dt>
                  <dd className="text-right text-on-surface">{value}</dd>
                </div>
              ))}
            </dl>
          </div>
        ))}
      </section>
    </div>
  );
}
