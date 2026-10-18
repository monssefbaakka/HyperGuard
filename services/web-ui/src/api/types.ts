/** Wire types mirroring the query-service DTOs (`com.pulsestream.query.dto`). */

export interface PageResponse<T> {
  content: T[];
  page: number;
  size: number;
  totalElements: number;
  totalPages: number;
  hasNext: boolean;
}

export interface TelemetryRecord {
  eventId: string;
  tenantId: string;
  eventType: string;
  timestamp: string;
  source: string;
  deviceId: string;
  deviceType: string;
  metric: string;
  value: number;
  unit: string;
  location: string;
  ingestedAt: string;
}

export interface AnomalyRecord {
  eventId: string;
  tenantId: string;
  timestamp: string;
  deviceId: string;
  metric: string;
  value: number;
  threshold: number;
  anomalyType: string;
  severity: string;
  ingestedAt: string;
}

export interface SeriesPoint {
  timestamp: string;
  value: number;
}

export interface MetricSeries {
  deviceId: string;
  metric: string;
  unit: string | null;
  points: SeriesPoint[];
  truncated: boolean;
}

export interface Facets {
  tenants: string[];
  devices: string[];
  metrics: string[];
  eventTypes: string[];
  anomalySeverities: string[];
  anomalyTypes: string[];
}

/** One hour of the activity chart. Quiet hours are present with a count of zero. */
export interface ActivityBucket {
  start: string;
  count: number;
}

/** A device and the state of its most recent reading. */
export interface DeviceSummary {
  deviceId: string;
  deviceType: string;
  location: string;
  metric: string;
  lastValue: number;
  unit: string;
  lastSeen: string;
  readings: number;
}

export interface Summary {
  tenantId: string | null;
  processedEvents: number;
  anomalies: number;
  devices: number;
  latestEventTimestamp: string | null;
}

export type IncidentStatus = 'OPEN' | 'ACKNOWLEDGED' | 'RESOLVED';

export interface IncidentRecord {
  id: number;
  tenantId: string;
  deviceId: string;
  status: IncidentStatus;
  severity: string;
  anomalyCount: number;
  metrics: string[];
  peakValue: number;
  peakThreshold: number;
  openedAt: string;
  lastAnomalyAt: string;
  acknowledgedAt: string | null;
  acknowledgedBy: string | null;
  resolvedAt: string | null;
  resolvedBy: string | null;
  resolutionNote: string | null;
  quarantined: boolean;
}

export interface QuarantineRecord {
  tenantId: string;
  deviceId: string;
  reason: string;
  incidentId: number | null;
  quarantinedBy: string;
  quarantinedAt: string;
  suppressedEvents: number;
}

export interface PlatformConfig {
  environment: string;
  staleAfterMs: number;
  autoRefreshMs: number;
  readingsRefreshMs: number;
  maxPageSize: number;
  kafka: {
    topics: { raw: string; processed: string; anomalies: string; dlq: string };
    producer: {
      acknowledgements: string;
      retries: number;
      publishTimeoutMs: number;
      deliveryTimeoutMs: number;
    };
    consumer: {
      group: string;
      ackMode: string;
      autoOffsetReset: string;
      concurrency: number;
      dlqGroup: string;
      dlqReplayIdleTimeoutMs: number;
    };
  };
  detection: {
    maxTemperature: number;
    minTemperature: number;
    spikeRatio: number;
    severities: string[];
  };
}

/**
 * The broker's own description of the streaming tier (`GET /api/v1/topology/kafka`). When the
 * cluster is unreachable `available` is false and `error` says why.
 */
export interface KafkaTopology {
  available: boolean;
  error: string | null;
  clusterId: string | null;
  brokerCount: number;
  primaryGroup: string;
  topics: KafkaTopic[];
  consumerGroups: KafkaConsumerGroup[];
}

export interface KafkaTopic {
  name: string;
  partitionCount: number;
  replicationFactor: number;
  fullyReplicated: boolean;
  partitions: KafkaPartition[];
}

export interface KafkaPartition {
  partition: number;
  leader: string;
  replicaCount: number;
  inSyncCount: number;
  endOffset: number;
  /** Null when the primary consumer group has never committed on this partition. */
  committedOffset: number | null;
  lag: number | null;
}

export interface KafkaConsumerGroup {
  groupId: string;
  state: string;
  memberCount: number;
}

/**
 * Spring Boot Actuator's health payload. `show-details: never` is set on both services, so `status`
 * is the only field ever present — no per-component (db/kafka/etc) breakdown to surface.
 */
export interface HealthResponse {
  status: string;
}

/** The platform-wide error body returned by both services. */
export interface ErrorResponse {
  timestamp: string;
  status: number;
  error: string;
  message: string;
  path: string;
  errors?: { field: string; message: string }[];
}

/** Request body accepted by ingestion-service `POST /api/v1/events`. */
export interface TelemetryIngestionRequest {
  eventId: string;
  tenantId: string;
  eventType: string;
  timestamp: string;
  source: string;
  version: string;
  payload: {
    deviceId: string;
    deviceType: string;
    metric: string;
    value: number;
    unit: string;
    location: string;
  };
}
