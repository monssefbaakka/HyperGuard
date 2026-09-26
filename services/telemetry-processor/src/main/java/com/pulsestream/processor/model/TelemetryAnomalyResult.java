package com.pulsestream.processor.model;

import java.math.BigDecimal;
import java.util.List;

/**
 * Outcome of anomaly detection for one reading.
 *
 * @param anomalyType the rule that fired first ({@code THRESHOLD_BREACH}, {@code SPIKE} or
 *                    {@code MISSING_FIELD}); {@code null} for a normal reading
 * @param threshold   the limit the reading crossed, so it can be stored next to the value; {@code null}
 *                    when no numeric limit applies (a missing field)
 */
public record TelemetryAnomalyResult(
        NormalizedTelemetryEvent event,
        boolean anomalous,
        AnomalySeverity severity,
        List<String> reasons,
        String anomalyType,
        BigDecimal threshold
) {
    public static final String THRESHOLD_BREACH = "THRESHOLD_BREACH";
    public static final String SPIKE = "SPIKE";
    public static final String MISSING_FIELD = "MISSING_FIELD";

    public static TelemetryAnomalyResult normal(NormalizedTelemetryEvent event) {
        return new TelemetryAnomalyResult(event, false, AnomalySeverity.NONE, List.of(), null, null);
    }

    public static TelemetryAnomalyResult anomalous(
            NormalizedTelemetryEvent event,
            AnomalySeverity severity,
            List<String> reasons
    ) {
        return anomalous(event, severity, reasons, null, null);
    }

    public static TelemetryAnomalyResult anomalous(
            NormalizedTelemetryEvent event,
            AnomalySeverity severity,
            List<String> reasons,
            String anomalyType,
            BigDecimal threshold
    ) {
        return new TelemetryAnomalyResult(event, true, severity, List.copyOf(reasons), anomalyType, threshold);
    }
}
