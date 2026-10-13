package com.pulsestream.query.model;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.math.BigDecimal;
import java.time.Instant;

/**
 * Read-only JPA mapping of the {@code platform.processed_telemetry} table written by the
 * telemetry-processor.
 *
 * <p>The schema is owned by {@code infrastructure/docker/postgres/init.sql} and the rows are owned
 * by {@code telemetry-processor}; the query service only reads them, so this entity exposes getters
 * and no mutators.
 */
@Entity
@Table(name = "processed_telemetry")
public class ProcessedTelemetryEntity {

    @Id
    private Long id;

    @Column(name = "event_id", nullable = false, unique = true, length = 50)
    private String eventId;

    @Column(name = "tenant_id", nullable = false, length = 100)
    private String tenantId;

    @Column(name = "event_type", nullable = false, length = 50)
    private String eventType;

    @Column(name = "timestamp", nullable = false)
    private Instant timestamp;

    @Column(name = "source", nullable = false, length = 100)
    private String source;

    @Column(name = "device_id", nullable = false, length = 100)
    private String deviceId;

    @Column(name = "device_type", nullable = false, length = 100)
    private String deviceType;

    @Column(name = "metric", nullable = false, length = 100)
    private String metric;

    @Column(name = "value", nullable = false, precision = 18, scale = 4)
    private BigDecimal value;

    @Column(name = "unit", nullable = false, length = 20)
    private String unit;

    @Column(name = "location", nullable = false, length = 100)
    private String location;

    @Column(name = "ingested_at", nullable = false)
    private Instant ingestedAt;

    protected ProcessedTelemetryEntity() {
        // Required by JPA.
    }

    public Long getId() {
        return id;
    }

    public String getEventId() {
        return eventId;
    }

    public String getTenantId() {
        return tenantId;
    }

    public String getEventType() {
        return eventType;
    }

    public Instant getTimestamp() {
        return timestamp;
    }

    public String getSource() {
        return source;
    }

    public String getDeviceId() {
        return deviceId;
    }

    public String getDeviceType() {
        return deviceType;
    }

    public String getMetric() {
        return metric;
    }

    public BigDecimal getValue() {
        return value;
    }

    public String getUnit() {
        return unit;
    }

    public String getLocation() {
        return location;
    }

    public Instant getIngestedAt() {
        return ingestedAt;
    }
}
