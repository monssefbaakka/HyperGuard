package com.pulsestream.query.model;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.math.BigDecimal;
import java.time.Instant;

/**
 * Read-only JPA mapping of the {@code platform.anomalies} table.
 *
 * <p>The table is created by {@code infrastructure/docker/postgres/init.sql} and written by
 * telemetry-processor, which also links each row to the incident it was correlated into.
 */
@Entity
@Table(name = "anomalies")
public class AnomalyEntity {

    @Id
    private Long id;

    @Column(name = "event_id", nullable = false, unique = true, length = 50)
    private String eventId;

    @Column(name = "tenant_id", nullable = false, length = 100)
    private String tenantId;

    @Column(name = "timestamp", nullable = false)
    private Instant timestamp;

    @Column(name = "device_id", nullable = false, length = 100)
    private String deviceId;

    @Column(name = "metric", nullable = false, length = 100)
    private String metric;

    @Column(name = "value", nullable = false, precision = 18, scale = 4)
    private BigDecimal value;

    @Column(name = "threshold", nullable = false, precision = 18, scale = 4)
    private BigDecimal threshold;

    @Column(name = "anomaly_type", nullable = false, length = 50)
    private String anomalyType;

    @Column(name = "severity", nullable = false, length = 20)
    private String severity;

    @Column(name = "reasons", length = 1000)
    private String reasons;

    @Column(name = "incident_id")
    private Long incidentId;

    @Column(name = "ingested_at", nullable = false)
    private Instant ingestedAt;

    protected AnomalyEntity() {
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

    public Instant getTimestamp() {
        return timestamp;
    }

    public String getDeviceId() {
        return deviceId;
    }

    public String getMetric() {
        return metric;
    }

    public BigDecimal getValue() {
        return value;
    }

    public BigDecimal getThreshold() {
        return threshold;
    }

    public String getAnomalyType() {
        return anomalyType;
    }

    public String getSeverity() {
        return severity;
    }

    public String getReasons() {
        return reasons;
    }

    public Long getIncidentId() {
        return incidentId;
    }

    public Instant getIngestedAt() {
        return ingestedAt;
    }
}
