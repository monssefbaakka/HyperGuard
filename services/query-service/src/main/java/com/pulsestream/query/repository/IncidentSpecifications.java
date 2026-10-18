package com.pulsestream.query.repository;

import com.pulsestream.query.model.IncidentEntity;
import java.util.Locale;
import org.springframework.data.jpa.domain.Specification;
import org.springframework.util.StringUtils;

/**
 * Composable filters for incident queries. Status and severity are matched case-insensitively, like
 * the anomaly filters, and the pseudo-status {@code ACTIVE} means "not resolved yet".
 */
public final class IncidentSpecifications {

    public static final String ACTIVE = "ACTIVE";

    private IncidentSpecifications() {
    }

    public static Specification<IncidentEntity> matchesAll(String tenantId, String deviceId, String status, String severity) {
        return Specification.allOf(
                equalsIgnoringBlank("tenantId", tenantId),
                equalsIgnoringBlank("deviceId", deviceId),
                status(status),
                equalsIgnoringCase("severity", severity));
    }

    private static Specification<IncidentEntity> status(String status) {
        if (!StringUtils.hasText(status)) {
            return null;
        }
        if (ACTIVE.equalsIgnoreCase(status)) {
            return (root, query, builder) -> builder.notEqual(root.get("status"), IncidentEntity.RESOLVED);
        }
        return equalsIgnoringCase("status", status);
    }

    private static Specification<IncidentEntity> equalsIgnoringBlank(String attribute, String value) {
        if (!StringUtils.hasText(value)) {
            return null;
        }
        return (root, query, builder) -> builder.equal(root.get(attribute), value);
    }

    private static Specification<IncidentEntity> equalsIgnoringCase(String attribute, String value) {
        if (!StringUtils.hasText(value)) {
            return null;
        }
        return (root, query, builder) ->
                builder.equal(builder.lower(root.get(attribute)), value.toLowerCase(Locale.ROOT));
    }
}
