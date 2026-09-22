package com.pulsestream.processor.model;

import jakarta.persistence.Column;
import jakarta.persistence.Embeddable;
import jakarta.persistence.EmbeddedId;
import jakarta.persistence.Entity;
import jakarta.persistence.Table;
import java.io.Serializable;
import java.time.Instant;

/**
 * A row of {@code platform.device_quarantine}. Rows are created and removed by query-service; the
 * processor only reads them and counts the readings it drops.
 */
@Entity
@Table(name = "device_quarantine")
public class DeviceQuarantineEntity {

    @EmbeddedId
    private Key key;

    @Column(name = "reason", nullable = false, length = 500)
    private String reason;

    @Column(name = "quarantined_by", nullable = false, length = 50)
    private String quarantinedBy;

    @Column(name = "quarantined_at", nullable = false)
    private Instant quarantinedAt;

    @Column(name = "suppressed_events", nullable = false)
    private long suppressedEvents;

    protected DeviceQuarantineEntity() {
        // Required by JPA.
    }

    public DeviceQuarantineEntity(String tenantId, String deviceId, String reason, String quarantinedBy, Instant at) {
        this.key = new Key(tenantId, deviceId);
        this.reason = reason;
        this.quarantinedBy = quarantinedBy;
        this.quarantinedAt = at;
    }

    public Key getKey() {
        return key;
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
