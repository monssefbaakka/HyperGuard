package com.pulsestream.query.dto;

import com.pulsestream.query.model.DeviceQuarantineEntity;
import com.pulsestream.query.model.IncidentEntity;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import java.math.BigDecimal;
import java.time.Instant;
import java.util.Arrays;
import java.util.List;

/** Request and response bodies of {@code /api/v1/incidents} and device quarantine. */
public final class IncidentDtos {

    private IncidentDtos() {
    }

    /**
     * @param quarantined whether the incident's device is currently quarantined, so the console can
     *                    show the state without a second call
     */
    public record IncidentDto(
            Long id,
            String tenantId,
            String deviceId,
            String status,
            String severity,
            int anomalyCount,
            List<String> metrics,
            BigDecimal peakValue,
            BigDecimal peakThreshold,
            Instant openedAt,
            Instant lastAnomalyAt,
            Instant acknowledgedAt,
            String acknowledgedBy,
            Instant resolvedAt,
            String resolvedBy,
            String resolutionNote,
            boolean quarantined) {

        public static IncidentDto from(IncidentEntity entity, boolean quarantined) {
            return new IncidentDto(
                    entity.getId(),
                    entity.getTenantId(),
                    entity.getDeviceId(),
                    entity.getStatus(),
                    entity.getSeverity(),
                    entity.getAnomalyCount(),
                    Arrays.stream(entity.getMetrics().split(",")).filter(metric -> !metric.isBlank()).toList(),
                    entity.getPeakValue(),
                    entity.getPeakThreshold(),
                    entity.getOpenedAt(),
                    entity.getLastAnomalyAt(),
                    entity.getAcknowledgedAt(),
                    entity.getAcknowledgedBy(),
                    entity.getResolvedAt(),
                    entity.getResolvedBy(),
                    entity.getResolutionNote(),
                    quarantined);
        }
    }

    /**
     * @param anomalies the correlated readings, oldest first; at most {@code anomaliesLimit} of the
     *                  incident's {@code anomalyCount}
     */
    public record IncidentDetailDto(IncidentDto incident, List<AnomalyRecordDto> anomalies, int anomaliesLimit) {
    }

    public record ResolveRequest(@NotBlank @Size(max = 1000) String note) {
    }

    public record QuarantineRequest(
            @NotBlank @Size(max = 500) String reason,
            Long incidentId) {
    }

    public record QuarantineDto(
            String tenantId,
            String deviceId,
            String reason,
            Long incidentId,
            String quarantinedBy,
            Instant quarantinedAt,
            long suppressedEvents) {

        public static QuarantineDto from(DeviceQuarantineEntity entity) {
            return new QuarantineDto(
                    entity.getKey().tenantId(),
                    entity.getKey().deviceId(),
                    entity.getReason(),
                    entity.getIncidentId(),
                    entity.getQuarantinedBy(),
                    entity.getQuarantinedAt(),
                    entity.getSuppressedEvents());
        }
    }
}
