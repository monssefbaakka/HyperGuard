package com.pulsestream.query.repository;

import com.pulsestream.query.model.ProcessedTelemetryEntity;
import java.time.Instant;
import org.springframework.data.jpa.domain.Specification;
import org.springframework.util.StringUtils;

/**
 * Composable filters for processed telemetry queries.
 *
 * <p>Every factory returns {@code null} for an absent filter value, which Spring Data treats as "no
 * restriction" when the specifications are chained, so callers can pass optional request parameters
 * straight through.
 */
public final class TelemetrySpecifications {

    private TelemetrySpecifications() {
    }

    public static Specification<ProcessedTelemetryEntity> matchesAll(
            String tenantId,
            String deviceId,
            String metric,
            String eventType,
            Instant from,
            Instant to) {

        return Specification.allOf(
                equalsIgnoringBlank("tenantId", tenantId),
                equalsIgnoringBlank("deviceId", deviceId),
                equalsIgnoringBlank("metric", metric),
                equalsIgnoringBlank("eventType", eventType),
                timestampAtOrAfter(from),
                timestampAtOrBefore(to));
    }

    private static Specification<ProcessedTelemetryEntity> equalsIgnoringBlank(String attribute, String value) {
        if (!StringUtils.hasText(value)) {
            return null;
        }
        return (root, query, builder) -> builder.equal(root.get(attribute), value);
    }

    private static Specification<ProcessedTelemetryEntity> timestampAtOrAfter(Instant from) {
        if (from == null) {
            return null;
        }
        return (root, query, builder) -> builder.greaterThanOrEqualTo(root.get("timestamp"), from);
    }

    private static Specification<ProcessedTelemetryEntity> timestampAtOrBefore(Instant to) {
        if (to == null) {
            return null;
        }
        return (root, query, builder) -> builder.lessThanOrEqualTo(root.get("timestamp"), to);
    }
}
