package com.pulsestream.processor.model;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import jakarta.persistence.Version;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.Instant;
import java.util.Arrays;
import java.util.LinkedHashSet;
import java.util.Set;

/**
 * The processor's side of {@code platform.incidents}: it opens incidents and folds new anomalies into
 * them. Acknowledging and resolving belong to query-service, which maps the same table.
 */
@Entity
@Table(name = "incidents")
public class IncidentEntity {

    public static final String OPEN = "OPEN";
    public static final String RESOLVED = "RESOLVED";

    /** Recorded as the resolver when an idle incident is closed to make room for a new one. */
    public static final String AUTO_RESOLVER = "system";

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
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

    public IncidentEntity(
            String tenantId,
            String deviceId,
            AnomalySeverity severity,
            String metric,
            BigDecimal value,
            BigDecimal threshold,
            Instant at
    ) {
        this.tenantId = tenantId;
        this.deviceId = deviceId;
        this.status = OPEN;
        this.severity = severity.name();
        this.anomalyCount = 1;
        this.metrics = metric;
        this.peakValue = value;
        this.peakThreshold = threshold;
        this.openedAt = at;
        this.lastAnomalyAt = at;
    }

    /** Folds one more anomaly in: count, worst severity, metric set, peak deviation and latest time. */
    public void absorb(AnomalySeverity anomalySeverity, String metric, BigDecimal value, BigDecimal threshold, Instant at) {
        anomalyCount++;
        if (anomalySeverity.ordinal() > AnomalySeverity.valueOf(severity).ordinal()) {
            severity = anomalySeverity.name();
        }
        Set<String> known = new LinkedHashSet<>(Arrays.asList(metrics.split(",")));
        known.remove("");
        known.add(metric);
        metrics = String.join(",", known);
        if (deviation(value, threshold).compareTo(deviation(peakValue, peakThreshold)) > 0) {
            peakValue = value;
            peakThreshold = threshold;
        }
        if (at.isAfter(lastAnomalyAt)) {
            lastAnomalyAt = at;
        }
    }

    /** Closes an incident that went quiet for longer than the correlation window. */
    public void autoResolve(Instant at) {
        status = RESOLVED;
        resolvedAt = at;
        resolvedBy = AUTO_RESOLVER;
        resolutionNote = "No new anomaly within the correlation window.";
    }

    static BigDecimal deviation(BigDecimal value, BigDecimal threshold) {
        BigDecimal base = threshold.abs().max(BigDecimal.ONE);
        return value.subtract(threshold).abs().divide(base, 6, RoundingMode.HALF_UP);
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

    public Instant getResolvedAt() {
        return resolvedAt;
    }

    public String getResolvedBy() {
        return resolvedBy;
    }
}
