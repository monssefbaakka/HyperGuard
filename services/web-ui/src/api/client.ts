import type {
  ActivityBucket,
  AnomalyRecord,
  DeviceSummary,
  ErrorResponse,
  Facets,
  HealthResponse,
  KafkaTopology,
  MetricSeries,
  PageResponse,
  PlatformConfig,
  QuarantineRecord,
  Summary,
  TelemetryIngestionRequest,
  TelemetryRecord,
} from './types';

/**
 * Both backends are reached through same-origin prefixes that the dev server and the container's
 * nginx map onto the real services, so no base URL is baked into the bundle.
 */
const QUERY_PREFIX = '/api/v1';
const INGEST_PREFIX = '/ingest/api/v1';

let apiSessionToken: string | null = null;
let apiSessionEnded: (() => void) | null = null;

export function setApiSession(token: string | null): void {
  apiSessionToken = token;
}

export function onApiSessionEnded(listener: (() => void) | null): void {
  apiSessionEnded = listener;
}

function withSession(headers?: HeadersInit): Headers {
  const result = new Headers(headers);
  if (apiSessionToken) {
    result.set('Authorization', `Bearer ${apiSessionToken}`);
  }
  return result;
}

async function requestWithSession(path: string, init: RequestInit = {}): Promise<Response> {
  const response = await fetch(path, { ...init, headers: withSession(init.headers) });
  if (response.status === 401 && apiSessionToken) {
    apiSessionEnded?.();
  }
  return response;
}

/** An error carrying the platform error body when the service returned one. */
export class ApiError extends Error {
  readonly status: number;
  readonly details: ErrorResponse | null;

  constructor(message: string, status: number, details: ErrorResponse | null) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.details = details;
  }

  /** Field-level messages, flattened for display next to a form or filter bar. */
  fieldMessages(): string[] {
    return (this.details?.errors ?? []).map((entry) => `${entry.field}: ${entry.message}`);
  }
}

type QueryValue = string | number | boolean | null | undefined;

function buildQuery(params: Record<string, QueryValue>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === null || value === undefined || value === '') {
      continue;
    }
    search.set(key, String(value));
  }
  const query = search.toString();
  return query ? `?${query}` : '';
}

async function readError(response: Response): Promise<ApiError> {
  let body: ErrorResponse | null = null;
  try {
    body = (await response.json()) as ErrorResponse;
  } catch {
    // A proxy or a crashed service can answer with something that is not the platform error body;
    // fall back to the status line rather than masking the failure.
    body = null;
  }
  const message = body?.message ?? `${response.status} ${response.statusText}`;
  return new ApiError(message, response.status, body);
}

async function getJson<T>(path: string, signal?: AbortSignal): Promise<T> {
  const response = await requestWithSession(path, { signal, headers: { Accept: 'application/json' } });
  if (!response.ok) {
    throw await readError(response);
  }
  return (await response.json()) as T;
}

async function sendJson<T>(path: string, method: 'POST' | 'DELETE', body?: unknown): Promise<T> {
  const response = await requestWithSession(path, {
    method,
    headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!response.ok) {
    throw await readError(response);
  }
  if (response.status === 204) {
    return undefined as T;
  }
  return (await response.json()) as T;
}

export interface TelemetryQuery {
  tenantId?: string;
  deviceId?: string;
  metric?: string;
  eventType?: string;
  from?: string;
  to?: string;
  page?: number;
  size?: number;
  sort?: string;
  direction?: 'asc' | 'desc';
}

export interface AnomalyQuery {
  tenantId?: string;
  deviceId?: string;
  metric?: string;
  severity?: string;
  anomalyType?: string;
  from?: string;
  to?: string;
  page?: number;
  size?: number;
  sort?: string;
  direction?: 'asc' | 'desc';
}

export function fetchTelemetry(
  query: TelemetryQuery,
  signal?: AbortSignal,
): Promise<PageResponse<TelemetryRecord>> {
  return getJson(`${QUERY_PREFIX}/telemetry${buildQuery({ ...query })}`, signal);
}

export function fetchSeries(
  query: { tenantId?: string; deviceId: string; metric: string; from?: string; to?: string; limit?: number },
  signal?: AbortSignal,
): Promise<MetricSeries> {
  return getJson(`${QUERY_PREFIX}/telemetry/series${buildQuery({ ...query })}`, signal);
}

export function fetchAnomalies(
  query: AnomalyQuery,
  signal?: AbortSignal,
): Promise<PageResponse<AnomalyRecord>> {
  return getJson(`${QUERY_PREFIX}/anomalies${buildQuery({ ...query })}`, signal);
}

export function fetchFacets(tenantId: string | undefined, signal?: AbortSignal): Promise<Facets> {
  return getJson(`${QUERY_PREFIX}/facets${buildQuery({ tenantId })}`, signal);
}

export function fetchSummary(tenantId: string | undefined, signal?: AbortSignal): Promise<Summary> {
  return getJson(`${QUERY_PREFIX}/summary${buildQuery({ tenantId })}`, signal);
}

/** Readings per hour. Defaults to the last 24 hours when no window is given. */
export function fetchActivity(
  query: { tenantId?: string; from?: string; to?: string },
  signal?: AbortSignal,
): Promise<ActivityBucket[]> {
  return getJson(`${QUERY_PREFIX}/activity${buildQuery({ ...query })}`, signal);
}

export function fetchDevices(
  query: { tenantId?: string; limit?: number },
  signal?: AbortSignal,
): Promise<DeviceSummary[]> {
  return getJson(`${QUERY_PREFIX}/devices${buildQuery({ ...query })}`, signal);
}

/** Live topics, partitions, replication and consumer-group lag, straight from the broker. */
export function fetchKafkaTopology(signal?: AbortSignal): Promise<KafkaTopology> {
  return getJson(`${QUERY_PREFIX}/topology/kafka`, signal);
}

/**
 * Actuator health for each backend, used by the Overview screen's service health matrix. A thrown
 * error (network failure, 503) is treated by the caller as "down" — there is no separate offline
 * state to model here.
 */
export function fetchQueryServiceHealth(signal?: AbortSignal): Promise<HealthResponse> {
  return getJson('/qactuator/health', signal);
}

export function fetchIngestionServiceHealth(signal?: AbortSignal): Promise<HealthResponse> {
  return getJson('/ingest/actuator/health', signal);
}

export function fetchPlatformConfig(signal?: AbortSignal): Promise<PlatformConfig> {
  return getJson(`${QUERY_PREFIX}/platform/config`, signal);
}

export function fetchQuarantine(tenantId?: string, signal?: AbortSignal): Promise<QuarantineRecord[]> {
  return getJson(`${QUERY_PREFIX}/quarantine${buildQuery({ tenantId })}`, signal);
}

export function quarantineDevice(
  deviceId: string,
  input: { tenantId?: string; reason: string; incidentId?: number },
): Promise<QuarantineRecord> {
  const { tenantId, ...body } = input;
  return sendJson(
    `${QUERY_PREFIX}/devices/${encodeURIComponent(deviceId)}/quarantine${buildQuery({ tenantId })}`,
    'POST',
    body,
  );
}

export function releaseDevice(deviceId: string, tenantId?: string): Promise<QuarantineRecord> {
  return sendJson(
    `${QUERY_PREFIX}/devices/${encodeURIComponent(deviceId)}/quarantine${buildQuery({ tenantId })}`,
    'DELETE',
  );
}

/**
 * Publishes one event to the ingestion service. The endpoint answers 202 with an empty body, so
 * nothing is parsed on success.
 */
export async function publishEvent(request: TelemetryIngestionRequest): Promise<void> {
  const response = await requestWithSession(`${INGEST_PREFIX}/events`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
  });

  if (!response.ok) {
    throw await readError(response);
  }
}
