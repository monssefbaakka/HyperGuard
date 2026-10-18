/**
 * Read-only Prometheus client.
 *
 * <p>Service-level telemetry — request rate, latency percentiles, JVM and Kafka publish timings —
 * exists only as scraped metrics; neither REST API can answer for it. Everything this module returns
 * is a real measurement taken from the running services, and a query that has no data yet resolves to
 * `null` so the caller can render an honest placeholder instead of a made-up figure.
 */

const PROM_PREFIX = '/prom/api/v1';

interface PromVectorResponse {
  status: string;
  data: { resultType: string; result: { metric: Record<string, string>; value: [number, string] }[] };
}

interface PromMatrixResponse {
  status: string;
  data: { resultType: string; result: { metric: Record<string, string>; values: [number, string][] }[] };
}

interface PromRulesResponse {
  status: string;
  data: { groups: { rules: { state?: string; type: string }[] }[] };
}

async function getJson<T>(path: string, signal?: AbortSignal): Promise<T> {
  const response = await fetch(path, { signal, headers: { Accept: 'application/json' } });
  if (!response.ok) {
    throw new Error(`Prometheus responded ${response.status}`);
  }
  return (await response.json()) as T;
}

function parseSample(raw: string | undefined): number | null {
  if (raw === undefined) {
    return null;
  }
  const value = Number(raw);
  return Number.isFinite(value) ? value : null;
}

/** A single number for `query`, or null when the series has no samples yet. */
export async function promInstant(query: string, signal?: AbortSignal): Promise<number | null> {
  const body = await getJson<PromVectorResponse>(
    `${PROM_PREFIX}/query?query=${encodeURIComponent(query)}`,
    signal,
  );
  return parseSample(body.data.result[0]?.value?.[1]);
}

/** Several instant queries in one round trip's worth of latency, resolved in the order given. */
export function promInstantAll(queries: string[], signal?: AbortSignal): Promise<(number | null)[]> {
  return Promise.all(
    queries.map((query) => promInstant(query, signal).catch(() => null)),
  );
}

/** Values over the last `minutes`, evenly stepped — the shape behind each sparkline. */
export async function promRange(
  query: string,
  minutes: number,
  points: number,
  signal?: AbortSignal,
): Promise<number[]> {
  const end = Math.floor(Date.now() / 1000);
  const start = end - minutes * 60;
  const step = Math.max(1, Math.floor((end - start) / Math.max(1, points - 1)));
  const body = await getJson<PromMatrixResponse>(
    `${PROM_PREFIX}/query_range?query=${encodeURIComponent(query)}&start=${start}&end=${end}&step=${step}`,
    signal,
  );
  return (body.data.result[0]?.values ?? [])
    .map((entry) => parseSample(entry[1]))
    .filter((value): value is number => value !== null);
}

export interface PromRuleCounts {
  loaded: number;
  firing: number;
}

/** How many alert rules Prometheus has loaded, and how many are currently firing. */
export async function promRuleCounts(signal?: AbortSignal): Promise<PromRuleCounts> {
  const body = await getJson<PromRulesResponse>(`${PROM_PREFIX}/rules`, signal);
  const rules = body.data.groups.flatMap((group) => group.rules).filter((rule) => rule.type === 'alerting');
  return {
    loaded: rules.length,
    firing: rules.filter((rule) => rule.state === 'firing').length,
  };
}
