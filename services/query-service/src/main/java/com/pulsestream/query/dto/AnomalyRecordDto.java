package com.pulsestream.query.dto;

import com.pulsestream.query.model.AnomalyEntity;
import java.math.BigDecimal;
import java.time.Instant;

/**
 * API representation of one persisted anomaly record.
 */
public record AnomalyRecordDto(
        String eventId,
        String tenantId,
        Instant timestamp,
        String deviceId,
        String metric,
        BigDecimal value,
        BigDecimal threshold,
        String anomalyType,
        String severity,
        Instant ingestedAt) {

    public static AnomalyRecordDto from(AnomalyEntity entity) {
        return new AnomalyRecordDto(
                entity.getEventId(),
                entity.getTenantId(),
                entity.getTimestamp(),
                entity.getDeviceId(),
                entity.getMetric(),
                entity.getValue(),
                entity.getThreshold(),
                entity.getAnomalyType(),
                entity.getSeverity(),
                entity.getIngestedAt());
    }
}
