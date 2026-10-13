package com.pulsestream.query.model;

import jakarta.persistence.Column;
import jakarta.persistence.Embeddable;
import jakarta.persistence.EmbeddedId;
import jakarta.persistence.Entity;
import jakarta.persistence.Table;
import java.io.Serializable;
import java.time.Instant;

/**
 * A quarantined device in {@code platform.device_quarantine}. While the row exists,
 * telemetry-processor drops the device's readings and increments {@code suppressed_events}.
 */
@Entity
@Table(name = "device_quarantine")
public class DeviceQuarantineEntity {

    @EmbeddedId
    private Key key;

    @Column(name = "reason", nullable = false, length = 500)
    private String reason;

    @Column(name = "incident_id")
    private Long incidentId;

    @Column(name = "quarantined_by", nullable = false, length = 50)
    private String quarantinedBy;

    @Column(name = "quarantined_at", nullable = false)
    private Instant quarantinedAt;

    @Column(name = "suppressed_events", nullable = false)
    private long suppressedEvents;

    protected DeviceQuarantineEntity() {
        // Required by JPA.
    }

    public DeviceQuarantineEntity(
            String tenantId, String deviceId, String reason, Long incidentId, String quarantinedBy, Instant at) {
        this.key = new Key(tenantId, deviceId);
        this.reason = reason;
        this.incidentId = incidentId;
        this.quarantinedBy = quarantinedBy;
        this.quarantinedAt = at;
        this.suppressedEvents = 0;
    }

    public Key getKey() {
        return key;
    }

    public String getReason() {
        return reason;
    }

    public Long getIncidentId() {
        return incidentId;
    }

    public String getQuarantinedBy() {
        return quarantinedBy;
    }

    public Instant getQuarantinedAt() {
        return quarantinedAt;
    }

    public long getSuppressedEvents() {
        return suppressedEvents;
    }

    @Embeddable
    public record Key(
            @Column(name = "tenant_id", nullable = false, length = 100) String tenantId,
            @Column(name = "device_id", nullable = false, length = 100) String deviceId
    ) implements Serializable {
    }
}
