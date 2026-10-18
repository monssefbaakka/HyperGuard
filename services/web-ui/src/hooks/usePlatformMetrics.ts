import { promInstantAll, promRange, promRuleCounts, type PromRuleCounts } from '../api/prometheus';
import { useAsyncData, type AsyncState } from './useAsyncData';

const INGEST = 'job="ingestion-service"';
const QUERY = 'job="query-service"';

/**
 * Every field here is a real scraped measurement, or null when the series has no samples yet — a
 * freshly started service has no rate, and rendering "—" for it is the honest answer.
 */
export interface PlatformMetrics {
  /** Accepted events per second on ingestion-service's publish endpoint. */
  eventsPerSecond: number | null;
  /** The same rate an hour ago, for the trend badge. */
  eventsPerSecondPrior: number | null;
  eventsPerSecondTrace: number[];
  /** 99th percentile HTTP latency, seconds. Real histogram buckets, not an average. */
  p99Seconds: number | null;
  p99Trace: number[];
  /** Mean Kafka publish call duration on the producer side, seconds. */
  kafkaPublishSeconds: number | null;
  ingestionUptimeSeconds: number | null;
  ingestionHeapBytes: number | null;
  ingestionRequestRate: number | null;
  queryP99Seconds: number | null;
  queryUptimeSeconds: number | null;
  queryRequestRate: number | null;
  /** HikariCP pool on query-service — the real database connection tier. */
  poolActive: number | null;
  poolIdle: number | null;
  poolMax: number | null;
  targetsUp: number | null;
  targetsTotal: number | null;
  meanScrapeSeconds: number | null;
  rules: PromRuleCounts | null;
  /** Round trip of this metrics fetch itself, milliseconds. */
  queryRuntimeMs: number;
}

/**
 * Loads the service-level telemetry behind the Overview screen from Prometheus. It is deliberately a
 * single hook: the panels all describe the same instant, so they should be read in one pass rather
 * than drifting apart across separate refreshes.
 */
export function usePlatformMetrics(dataVersion: number): AsyncState<PlatformMetrics> {
  return useAsyncData<PlatformMetrics>(async (signal) => {
    const start = performance.now();

    const [
      eventsPerSecond,
      eventsPerSecondPrior,
      p99Seconds,
      kafkaPublishSeconds,
      ingestionUptimeSeconds,
      ingestionHeapBytes,
      ingestionRequestRate,
      queryP99Seconds,
      queryUptimeSeconds,
      queryRequestRate,
      poolActive,
      poolIdle,
      poolMax,
      targetsUp,
      targetsTotal,
      meanScrapeSeconds,
    ] = await promInstantAll(
      [
        `sum(rate(http_server_requests_seconds_count{${INGEST},uri="/api/v1/events"}[5m]))`,
        `sum(rate(http_server_requests_seconds_count{${INGEST},uri="/api/v1/events"}[5m] offset 1h))`,
        `histogram_quantile(0.99, sum(rate(http_server_requests_seconds_bucket{${INGEST}}[5m])) by (le))`,
        'sum(rate(spring_kafka_template_seconds_sum[5m]))/sum(rate(spring_kafka_template_seconds_count[5m]))',
        `process_uptime_seconds{${INGEST}}`,
        `sum(jvm_memory_used_bytes{${INGEST},area="heap"})`,
        `sum(rate(http_server_requests_seconds_count{${INGEST}}[5m]))`,
        `histogram_quantile(0.99, sum(rate(http_server_requests_seconds_bucket{${QUERY}}[5m])) by (le))`,
        `process_uptime_seconds{${QUERY}}`,
        `sum(rate(http_server_requests_seconds_count{${QUERY}}[5m]))`,
        `hikaricp_connections_active{${QUERY}}`,
        `hikaricp_connections_idle{${QUERY}}`,
        `hikaricp_connections_max{${QUERY}}`,
        'count(up == 1)',
        'count(up)',
        'avg(scrape_duration_seconds)',
      ],
      signal,
    );

    const [eventsPerSecondTrace, p99Trace, rules] = await Promise.all([
      promRange(
        `sum(rate(http_server_requests_seconds_count{${INGEST},uri="/api/v1/events"}[5m]))`,
        60,
        24,
        signal,
      ).catch(() => []),
      promRange(
        `histogram_quantile(0.99, sum(rate(http_server_requests_seconds_bucket{${INGEST}}[5m])) by (le))`,
        60,
        24,
        signal,
      ).catch(() => []),
      promRuleCounts(signal).catch(() => null),
    ]);

    return {
      eventsPerSecond,
      eventsPerSecondPrior,
      eventsPerSecondTrace,
      p99Seconds,
      p99Trace,
      kafkaPublishSeconds,
      ingestionUptimeSeconds,
      ingestionHeapBytes,
      ingestionRequestRate,
      queryP99Seconds,
      queryUptimeSeconds,
      queryRequestRate,
      poolActive,
      poolIdle,
      poolMax,
      targetsUp,
      targetsTotal,
      meanScrapeSeconds,
      rules,
      queryRuntimeMs: performance.now() - start,
    };
  }, [dataVersion]);
}
