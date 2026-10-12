package com.pulsestream.query.repository;

import com.pulsestream.query.model.AnomalyEntity;
import java.time.Instant;
import org.springframework.data.jpa.domain.Specification;
import org.springframework.util.StringUtils;

/**
 * Composable filters for anomaly queries.
 *
 * <p>Severity and anomaly type are matched case-insensitively because they are free-form strings in
 * the schema and callers should not have to know how the processor cased them.
 */
public final class AnomalySpecifications {

    private AnomalySpecifications() {
    }

    public static Specification<AnomalyEntity> matchesAll(
            String tenantId,
            String deviceId,
            String metric,
            String severity,
            String anomalyType,
            Instant from,
            Instant to) {

        return Specification.allOf(
                equalsIgnoringBlank("tenantId", tenantId),
                equalsIgnoringBlank("deviceId", deviceId),
                equalsIgnoringBlank("metric", metric),
                equalsIgnoringCase("severity", severity),
                equalsIgnoringCase("anomalyType", anomalyType),
                timestampAtOrAfter(from),
                timestampAtOrBefore(to));
    }

    private static Specification<AnomalyEntity> equalsIgnoringBlank(String attribute, String value) {
        if (!StringUtils.hasText(value)) {
            return null;
        }
        return (root, query, builder) -> builder.equal(root.get(attribute), value);
    }

    private static Specification<AnomalyEntity> equalsIgnoringCase(String attribute, String value) {
        if (!StringUtils.hasText(value)) {
            return null;
        }
        return (root, query, builder) -> builder.equal(
                builder.lower(root.get(attribute)), value.toLowerCase(java.util.Locale.ROOT));
    }

    private static Specification<AnomalyEntity> timestampAtOrAfter(Instant from) {
        if (from == null) {
            return null;
        }
        return (root, query, builder) -> builder.greaterThanOrEqualTo(root.get("timestamp"), from);
    }

    private static Specification<AnomalyEntity> timestampAtOrBefore(Instant to) {
        if (to == null) {
            return null;
        }
        return (root, query, builder) -> builder.lessThanOrEqualTo(root.get("timestamp"), to);
    }
}
