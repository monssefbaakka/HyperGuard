import { fetchIngestionServiceHealth, fetchQueryServiceHealth } from '../api/client';
import type { HealthResponse } from '../api/types';
import { useAsyncData } from '../hooks/useAsyncData';
import type { PlatformMetrics } from '../hooks/usePlatformMetrics';

type Status = 'up' | 'down' | 'unknown';

interface StatRow {
  label: string;
  value: string;
  /** Set when the value is "—" so the reader learns why, instead of guessing. */
  title?: string;
  tone?: 'default' | 'good' | 'critical';
}

interface ClusterCard {
  name: string;
  badge: string;
  badgeTone: 'neutral' | 'good' | 'primary';
  status: Status;
  rows: StatRow[];
}

const DOT: Record<Status, string> = { up: 'bg-secondary', down: 'bg-error', unknown: 'bg-outline' };
const BAR: Record<Status, string> = { up: 'bg-secondary', down: 'bg-error', unknown: 'bg-outline-variant' };
const BADGE: Record<ClusterCard['badgeTone'], string> = {
  neutral: 'text-on-surface-variant',
  good: 'text-on-secondary-container bg-secondary-container px-space-2xs rounded',
  primary: 'text-on-primary-container bg-primary-container px-space-2xs rounded',
};
const VALUE_TONE: Record<NonNullable<StatRow['tone']>, string> = {
  default: 'text-on-surface',
  good: 'text-secondary',
  critical: 'text-error',
};

const NOT_OBSERVABLE = 'Not exposed to the browser in this deployment — shown as "—" rather than guessed.';

function ms(seconds: number | null, fractionDigits = 1): string {
  return seconds == null ? '—' : `${(seconds * 1000).toFixed(fractionDigits)} ms`;
}

function healthStatus(state: { loading: boolean; data: HealthResponse | null; error: unknown }): Status {
  if (state.loading && !state.data && !state.error) return 'unknown';
  if (state.error) return 'down';
  return state.data?.status === 'UP' ? 'up' : 'down';
}

function uptime(seconds: number | null): string {
  if (seconds == null) return '—';
  if (seconds < 90) return `${Math.round(seconds)}s`;
  if (seconds < 5400) return `${Math.round(seconds / 60)}m`;
  return `${(seconds / 3600).toFixed(1)}h`;
}

interface ClusterMatrixProps {
  metrics: PlatformMetrics | null;
  dataVersion: number;
}

/**
 * The cluster tier as this console can genuinely observe it: Actuator health for the two HTTP
 * services, and scraped Prometheus metrics for latency, the JVM, the Kafka producer and the database
 * pool. Anything the deployment does not expose to a browser — Kafka partition/consumer-group state,
 * Redis internals — stays a dash with an explanation, never a plausible-looking number.
 */
export function ClusterMatrix({ metrics, dataVersion }: ClusterMatrixProps) {
  const ingestion = useAsyncData((signal) => fetchIngestionServiceHealth(signal), [dataVersion]);
  const query = useAsyncData((signal) => fetchQueryServiceHealth(signal), [dataVersion]);

  const ingestionStatus = healthStatus(ingestion);
  const queryStatus = healthStatus(query);
  const kafkaStatus: Status = metrics?.kafkaPublishSeconds != null ? 'up' : 'unknown';
  const promStatus: Status = metrics?.targetsUp != null ? 'up' : 'unknown';

  const cards: ClusterCard[] = [
    {
      name: 'Ingestion Core',
      badge: uptime(metrics?.ingestionUptimeSeconds ?? null),
      badgeTone: 'neutral',
      status: ingestionStatus,
      rows: [
        { label: 'Stack', value: 'Spring Boot · :8081' },
        { label: 'P99 Latency', value: ms(metrics?.p99Seconds ?? null), tone: 'good' },
        {
          label: 'Heap',
          value: metrics?.ingestionHeapBytes != null ? `${(metrics.ingestionHeapBytes / 1048576).toFixed(0)} MB` : '—',
        },
      ],
    },
    {
      name: 'Kafka Streamer',
      badge: 'ACK all',
      badgeTone: 'good',
      status: kafkaStatus,
      rows: [
        { label: 'Publish', value: ms(metrics?.kafkaPublishSeconds ?? null), tone: 'good' },
        { label: 'Topic', value: 'telemetry.events.raw' },
        { label: 'Consumer Lag', value: '—', title: `No Kafka admin API is wired in. ${NOT_OBSERVABLE}` },
      ],
    },
    {
      name: 'PostgreSQL Data',
      badge: 'HikariCP',
      badgeTone: 'neutral',
      status: queryStatus,
      rows: [
        { label: 'Read P99', value: ms(metrics?.queryP99Seconds ?? null), tone: 'good' },
        {
          label: 'Pool',
          value:
            metrics?.poolActive != null && metrics?.poolMax != null
              ? `${metrics.poolActive} / ${metrics.poolMax} active`
              : '—',
        },
        { label: 'Idle', value: metrics?.poolIdle != null ? String(metrics.poolIdle) : '—' },
      ],
    },
    {
      name: 'Redis Cache',
      badge: 'Not wired in',
      badgeTone: 'neutral',
      status: 'unknown',
      rows: [
        { label: 'Read Latency', value: '—', title: 'Redis is provisioned but not in the read/write path yet.' },
        { label: 'Memory', value: '—', title: 'Redis is provisioned but not in the read/write path yet.' },
        { label: 'Keys', value: '—', title: 'Redis is provisioned but not in the read/write path yet.' },
      ],
    },
    {
      name: 'Prom / Grafana',
      badge: 'Scrape 15s',
      badgeTone: 'neutral',
      status: promStatus,
      rows: [
        {
          label: 'Targets Up',
          value:
            metrics?.targetsUp != null && metrics?.targetsTotal != null
              ? `${metrics.targetsUp} / ${metrics.targetsTotal}`
              : '—',
          tone: 'good',
        },
        { label: 'Alert Rules', value: metrics?.rules ? `${metrics.rules.loaded} loaded` : '—' },
        {
          label: 'Firing Alerts',
          value: metrics?.rules ? String(metrics.rules.firing) : '—',
          tone: metrics?.rules && metrics.rules.firing > 0 ? 'critical' : 'default',
        },
      ],
    },
  ];

  return (
    <div className="grid grid-cols-1 gap-space-md md:grid-cols-2 lg:grid-cols-5">
      {cards.map((card) => (
        <div
          key={card.name}
          className="flex flex-col justify-between gap-space-sm rounded-lg bg-surface-container-low p-space-md transition-shadow hover:shadow-sm"
        >
          <div className="flex items-center justify-between gap-space-xs">
            <span className="flex items-center gap-space-2xs text-body-md font-semibold text-on-surface">
              <span className={`h-2 w-2 flex-none rounded-full ${DOT[card.status]}`} aria-hidden="true" />
              {card.name}
            </span>
            <span className={`font-mono text-label-sm ${BADGE[card.badgeTone]}`}>{card.badge}</span>
          </div>

          <div className="flex flex-col gap-space-2xs font-mono text-code-sm">
            {card.rows.map((row) => (
              <div key={row.label} className="flex justify-between gap-space-xs text-on-surface-variant" title={row.title}>
                <span>{row.label}</span>
                <span className={`font-medium ${VALUE_TONE[row.tone ?? 'default']}`}>{row.value}</span>
              </div>
            ))}
          </div>

          <div className="h-1 w-full overflow-hidden rounded-full bg-surface-container-high">
            <div
              className={`h-1 rounded-full ${BAR[card.status]}`}
              style={{ width: card.status === 'unknown' ? '15%' : '100%' }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}
