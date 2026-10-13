package com.pulsestream.query.dto;

import com.pulsestream.query.model.ProcessedTelemetryEntity;
import java.math.BigDecimal;
import java.time.Instant;

/**
 * API representation of one persisted processed telemetry event.
 */
public record TelemetryRecordDto(
        String eventId,
        String tenantId,
        String eventType,
        Instant timestamp,
        String source,
        String deviceId,
        String deviceType,
        String metric,
        BigDecimal value,
        String unit,
        String location,
        Instant ingestedAt) {

    public static TelemetryRecordDto from(ProcessedTelemetryEntity entity) {
        return new TelemetryRecordDto(
                entity.getEventId(),
                entity.getTenantId(),
                entity.getEventType(),
                entity.getTimestamp(),
                entity.getSource(),
                entity.getDeviceId(),
                entity.getDeviceType(),
                entity.getMetric(),
                entity.getValue(),
                entity.getUnit(),
                entity.getLocation(),
                entity.getIngestedAt());
    }
}
