package com.pulsestream.query.model;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import jakarta.persistence.Version;
import java.math.BigDecimal;
import java.time.Instant;

/**
 * An incident in {@code platform.incidents}: anomalies on one device, correlated by
 * telemetry-processor, which also maintains the counters and peak. This service owns the operator
 * lifecycle — acknowledging and resolving — and never changes what the processor measured.
 *
 * <p>The {@code version} column is shared with the processor, so an acknowledgement racing a new
 * anomaly fails instead of silently overwriting either side.
 */
@Entity
@Table(name = "incidents")
public class IncidentEntity {

    public static final String OPEN = "OPEN";
    public static final String ACKNOWLEDGED = "ACKNOWLEDGED";
    public static final String RESOLVED = "RESOLVED";

    @Id
    private Long id;

    @Column(name = "tenant_id", nullable = false, length = 100)
    private String tenantId;

    @Column(name = "device_id", nullable = false, length = 100)
    private String deviceId;

    @Column(name = "status", nullable = false, length = 20)
    private String status;

    @Column(name = "severity", nullable = false, length = 20)
    private String severity;

    @Column(name = "anomaly_count", nullable = false)
    private int anomalyCount;

    @Column(name = "metrics", nullable = false, length = 500)
    private String metrics;

    @Column(name = "peak_value", nullable = false, precision = 18, scale = 4)
    private BigDecimal peakValue;

    @Column(name = "peak_threshold", nullable = false, precision = 18, scale = 4)
    private BigDecimal peakThreshold;

    @Column(name = "opened_at", nullable = false)
    private Instant openedAt;

    @Column(name = "last_anomaly_at", nullable = false)
    private Instant lastAnomalyAt;

    @Column(name = "acknowledged_at")
    private Instant acknowledgedAt;

    @Column(name = "acknowledged_by", length = 50)
    private String acknowledgedBy;

    @Column(name = "resolved_at")
    private Instant resolvedAt;

    @Column(name = "resolved_by", length = 50)
    private String resolvedBy;

    @Column(name = "resolution_note", length = 1000)
    private String resolutionNote;

    @Version
    @Column(name = "version", nullable = false)
    private long version;

    protected IncidentEntity() {
        // Required by JPA.
    }

    /** Takes ownership of an open incident; acknowledging twice or after resolution is refused. */
    public void acknowledge(String operator, Instant at) {
        if (!OPEN.equals(status)) {
            throw new IllegalStateException(RESOLVED.equals(status)
                    ? "This incident is already resolved."
                    : "This incident was already acknowledged by " + acknowledgedBy + ".");
        }
        status = ACKNOWLEDGED;
        acknowledgedAt = at;
        acknowledgedBy = operator;
    }

    /** Closes the incident with the operator's explanation; resolving twice is refused. */
    public void resolve(String operator, String note, Instant at) {
        if (RESOLVED.equals(status)) {
            throw new IllegalStateException("This incident is already resolved.");
        }
        if (acknowledgedAt == null) {
            // Resolving straight away still records who took responsibility for it.
            acknowledgedAt = at;
            acknowledgedBy = operator;
        }
        status = RESOLVED;
        resolvedAt = at;
        resolvedBy = operator;
        resolutionNote = note;
    }

    public Long getId() {
        return id;
    }

    public String getTenantId() {
        return tenantId;
    }

    public String getDeviceId() {
        return deviceId;
    }

    public String getStatus() {
        return status;
    }

    public String getSeverity() {
        return severity;
    }

    public int getAnomalyCount() {
        return anomalyCount;
    }

    public String getMetrics() {
        return metrics;
    }

    public BigDecimal getPeakValue() {
        return peakValue;
    }

    public BigDecimal getPeakThreshold() {
        return peakThreshold;
    }

    public Instant getOpenedAt() {
        return openedAt;
    }

    public Instant getLastAnomalyAt() {
        return lastAnomalyAt;
    }

    public Instant getAcknowledgedAt() {
        return acknowledgedAt;
    }

    public String getAcknowledgedBy() {
        return acknowledgedBy;
    }

    public Instant getResolvedAt() {
        return resolvedAt;
    }

    public String getResolvedBy() {
        return resolvedBy;
    }

    public String getResolutionNote() {
        return resolutionNote;
    }
}
