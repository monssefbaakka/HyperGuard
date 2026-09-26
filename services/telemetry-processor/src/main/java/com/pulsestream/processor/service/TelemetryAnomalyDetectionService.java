package com.pulsestream.processor.service;

import com.pulsestream.processor.config.AnomalyDetectionProperties;
import com.pulsestream.processor.model.AnomalySeverity;
import com.pulsestream.processor.model.NormalizedTelemetryEvent;
import com.pulsestream.processor.model.TelemetryAnomalyResult;
import org.springframework.stereotype.Service;
import org.springframework.util.Assert;
import org.springframework.util.StringUtils;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.ConcurrentHashMap;

@Service
public class TelemetryAnomalyDetectionService {

    private final AnomalyDetectionProperties properties;

    private final ConcurrentHashMap<String, BigDecimal> lastSeenValues = new ConcurrentHashMap<>();

    public TelemetryAnomalyDetectionService(AnomalyDetectionProperties properties) {
        Assert.notNull(properties, "anomaly detection properties must not be null");
        this.properties = properties;
    }

    public TelemetryAnomalyResult detect(NormalizedTelemetryEvent event) {
        Assert.notNull(event, "normalized telemetry event must not be null");

        List<String> reasons = new ArrayList<>();
        boolean hasMissingCriticalField = false;
        // The first rule that fires names the anomaly and supplies the limit stored beside the value.
        String anomalyType = null;
        BigDecimal threshold = null;

        if (!StringUtils.hasText(event.tenantId())) {
            reasons.add("tenantId is required");
            hasMissingCriticalField = true;
        }

        if (!StringUtils.hasText(event.deviceId())) {
            reasons.add("deviceId is required");
            hasMissingCriticalField = true;
        }

        if (!StringUtils.hasText(event.metric())) {
            reasons.add("metric is required");
            hasMissingCriticalField = true;
        }

        if (event.value() == null) {
            reasons.add("value is required");
            hasMissingCriticalField = true;
        }

        if (hasMissingCriticalField) {
            anomalyType = TelemetryAnomalyResult.MISSING_FIELD;
        } else {
            if ("temperature".equals(event.metric())) {
                if (event.value().compareTo(properties.maxTemperature()) > 0) {
                    reasons.add("temperature is above maximum threshold");
                    anomalyType = TelemetryAnomalyResult.THRESHOLD_BREACH;
                    threshold = properties.maxTemperature();
                }

                if (event.value().compareTo(properties.minTemperature()) < 0) {
                    reasons.add("temperature is below minimum threshold");
                    anomalyType = TelemetryAnomalyResult.THRESHOLD_BREACH;
                    threshold = properties.minTemperature();
                }
            } else {
                // Same rule as temperature above, generalized to every other metric this platform
                // sees (humidity, pressure, level, vibration, co2, ...) via a configured safe band.
                // A metric with no configured range here is only checked for spikes, below.
                AnomalyDetectionProperties.MetricRange range = properties.metricRanges().get(event.metric());
                if (range != null) {
                    if (range.max() != null && event.value().compareTo(range.max()) > 0) {
                        reasons.add(event.metric() + " is above maximum threshold");
                        anomalyType = TelemetryAnomalyResult.THRESHOLD_BREACH;
                        threshold = range.max();
                    }

                    if (range.min() != null && event.value().compareTo(range.min()) < 0) {
                        reasons.add(event.metric() + " is below minimum threshold");
                        anomalyType = TelemetryAnomalyResult.THRESHOLD_BREACH;
                        threshold = range.min();
                    }
                }
            }

            String valueKey = event.tenantId() + ":" + event.deviceId() + ":" + event.metric();
            BigDecimal previous = lastSeenValues.put(valueKey, event.value());

            if (previous != null && previous.compareTo(BigDecimal.ZERO) != 0) {
                BigDecimal changeRatio = event.value().subtract(previous).abs()
                        .divide(previous.abs(), 10, RoundingMode.HALF_UP);
                if (changeRatio.compareTo(properties.spikeRatio()) > 0) {
                    BigDecimal pct = changeRatio.multiply(BigDecimal.valueOf(100))
                            .setScale(1, RoundingMode.HALF_UP);
                    reasons.add("value spike detected: changed by " + pct + "% from previous reading");
                    if (anomalyType == null) {
                        anomalyType = TelemetryAnomalyResult.SPIKE;
                        // The allowed band around the previous reading, on the side the value left it.
                        BigDecimal allowedChange = previous.abs().multiply(properties.spikeRatio());
                        threshold = event.value().compareTo(previous) > 0
                                ? previous.add(allowedChange)
                                : previous.subtract(allowedChange);
                    }
                }
            }
        }

        if (reasons.isEmpty()) {
            return TelemetryAnomalyResult.normal(event);
        }

        return TelemetryAnomalyResult.anomalous(
                event, resolveSeverity(hasMissingCriticalField), reasons, anomalyType, threshold);
    }

    private AnomalySeverity resolveSeverity(boolean hasMissingCriticalField) {
        return hasMissingCriticalField ? AnomalySeverity.CRITICAL : AnomalySeverity.WARNING;
    }
}