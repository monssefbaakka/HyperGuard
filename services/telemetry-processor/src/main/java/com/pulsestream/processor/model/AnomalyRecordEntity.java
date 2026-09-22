package com.pulsestream.processor.model;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.math.BigDecimal;
import java.time.Instant;

/**
 * One flagged reading in {@code platform.anomalies}, linked to the incident it was correlated into.
 *
 * <p>The schema is owned by {@code infrastructure/docker/postgres/init.sql}.
 */
@Entity
@Table(name = "anomalies")
public class AnomalyRecordEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
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

    protected AnomalyRecordEntity() {
        // Required by JPA.
    }

    public AnomalyRecordEntity(
            String eventId,
            String tenantId,
            Instant timestamp,
            String deviceId,
            String metric,
            BigDecimal value,
            BigDecimal threshold,
            String anomalyType,
            String severity,
            String reasons,
            Long incidentId,
            Instant ingestedAt
    ) {
        this.eventId = eventId;
        this.tenantId = tenantId;
        this.timestamp = timestamp;
        this.deviceId = deviceId;
        this.metric = metric;
        this.value = value;
        this.threshold = threshold;
        this.anomalyType = anomalyType;
        this.severity = severity;
        this.reasons = reasons;
        this.incidentId = incidentId;
        this.ingestedAt = ingestedAt;
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
