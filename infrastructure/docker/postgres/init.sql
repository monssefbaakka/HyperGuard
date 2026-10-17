-- PulseStream Database Initialization Script
-- This script creates the platform schema and initial tables for processed events.

-- 1. Create the platform schema
CREATE SCHEMA IF NOT EXISTS platform;

-- 2. Create the processed_telemetry table
-- This table stores enriched and normalized telemetry events.
CREATE TABLE IF NOT EXISTS platform.processed_telemetry (
    id SERIAL PRIMARY KEY,
    event_id VARCHAR(50) NOT NULL UNIQUE,
    tenant_id VARCHAR(100) NOT NULL,
    event_type VARCHAR(50) NOT NULL,
    timestamp TIMESTAMPTZ NOT NULL,
    source VARCHAR(100) NOT NULL,
    device_id VARCHAR(100) NOT NULL,
    device_type VARCHAR(100) NOT NULL,
    metric VARCHAR(100) NOT NULL,
    value NUMERIC(18, 4) NOT NULL,
    unit VARCHAR(20) NOT NULL,
    location VARCHAR(100) NOT NULL,
    ingested_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Optimize queries by tenant, device, and time
CREATE INDEX IF NOT EXISTS idx_telemetry_tenant ON platform.processed_telemetry (tenant_id);
CREATE INDEX IF NOT EXISTS idx_telemetry_device ON platform.processed_telemetry (device_id);
CREATE INDEX IF NOT EXISTS idx_telemetry_timestamp ON platform.processed_telemetry (timestamp DESC);

-- 3. Create the anomalies table
-- This table stores detected anomalies from the telemetry processor.
CREATE TABLE IF NOT EXISTS platform.anomalies (
    id SERIAL PRIMARY KEY,
    event_id VARCHAR(50) NOT NULL UNIQUE,
    tenant_id VARCHAR(100) NOT NULL,
    timestamp TIMESTAMPTZ NOT NULL,
    device_id VARCHAR(100) NOT NULL,
    metric VARCHAR(100) NOT NULL,
    value NUMERIC(18, 4) NOT NULL,
    threshold NUMERIC(18, 4) NOT NULL,
    anomaly_type VARCHAR(50) NOT NULL,
    severity VARCHAR(20) NOT NULL,
    ingested_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Optimize queries by tenant, device, and time for anomalies
CREATE INDEX IF NOT EXISTS idx_anomalies_tenant ON platform.anomalies (tenant_id);
CREATE INDEX IF NOT EXISTS idx_anomalies_device ON platform.anomalies (device_id);
CREATE INDEX IF NOT EXISTS idx_anomalies_timestamp ON platform.anomalies (timestamp DESC);

-- 4. Console operators, their sessions and profile photos (owned by query-service)
CREATE TABLE IF NOT EXISTS platform.operators (
    id BIGSERIAL PRIMARY KEY,
    username VARCHAR(50) NOT NULL UNIQUE,
    password_hash VARCHAR(100) NOT NULL,
    display_name VARCHAR(100) NOT NULL,
    email VARCHAR(254),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Only the SHA-256 of a session token is stored, so a database read does not hand out live sessions.
CREATE TABLE IF NOT EXISTS platform.operator_sessions (
    id BIGSERIAL PRIMARY KEY,
    token_hash VARCHAR(64) NOT NULL UNIQUE,
    operator_id BIGINT NOT NULL REFERENCES platform.operators (id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_operator_sessions_operator ON platform.operator_sessions (operator_id);

CREATE TABLE IF NOT EXISTS platform.operator_avatars (
    operator_id BIGINT PRIMARY KEY REFERENCES platform.operators (id) ON DELETE CASCADE,
    content_type VARCHAR(50) NOT NULL,
    data BYTEA NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 5. Incidents: anomalies correlated per device by telemetry-processor, triaged by operators in
-- query-service. At most one incident per device is active (OPEN or ACKNOWLEDGED) at a time.
CREATE TABLE IF NOT EXISTS platform.incidents (
    id BIGSERIAL PRIMARY KEY,
    tenant_id VARCHAR(100) NOT NULL,
    device_id VARCHAR(100) NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'OPEN',
    severity VARCHAR(20) NOT NULL,
    anomaly_count INTEGER NOT NULL DEFAULT 0,
    metrics VARCHAR(500) NOT NULL DEFAULT '',
    peak_value NUMERIC(18, 4) NOT NULL,
    peak_threshold NUMERIC(18, 4) NOT NULL,
    opened_at TIMESTAMPTZ NOT NULL,
    last_anomaly_at TIMESTAMPTZ NOT NULL,
    acknowledged_at TIMESTAMPTZ,
    acknowledged_by VARCHAR(50),
    resolved_at TIMESTAMPTZ,
    resolved_by VARCHAR(50),
    resolution_note VARCHAR(1000),
    version BIGINT NOT NULL DEFAULT 0,
    CONSTRAINT chk_incidents_status CHECK (status IN ('OPEN', 'ACKNOWLEDGED', 'RESOLVED'))
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_incidents_active_device
    ON platform.incidents (tenant_id, device_id) WHERE status <> 'RESOLVED';
CREATE INDEX IF NOT EXISTS idx_incidents_status_last ON platform.incidents (status, last_anomaly_at DESC);

ALTER TABLE platform.anomalies ADD COLUMN IF NOT EXISTS reasons VARCHAR(1000);
ALTER TABLE platform.anomalies
    ADD COLUMN IF NOT EXISTS incident_id BIGINT REFERENCES platform.incidents (id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_anomalies_incident ON platform.anomalies (incident_id);

-- 6. Quarantined devices: telemetry-processor drops their readings (no storage, no alerts) until an
-- operator releases them. suppressed_events counts what was dropped while quarantined.
CREATE TABLE IF NOT EXISTS platform.device_quarantine (
    tenant_id VARCHAR(100) NOT NULL,
    device_id VARCHAR(100) NOT NULL,
    reason VARCHAR(500) NOT NULL,
    incident_id BIGINT REFERENCES platform.incidents (id) ON DELETE SET NULL,
    quarantined_by VARCHAR(50) NOT NULL,
    quarantined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    suppressed_events BIGINT NOT NULL DEFAULT 0,
    PRIMARY KEY (tenant_id, device_id)
);

-- 7. Initial seed data (optional, but useful for testing)
-- Could add some sample data if needed.
