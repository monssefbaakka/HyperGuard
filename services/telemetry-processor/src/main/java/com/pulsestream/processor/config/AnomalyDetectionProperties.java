package com.pulsestream.processor.config;

import java.math.BigDecimal;
import java.util.Map;
import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * Heuristic anomaly rules, bound from {@code pulsestream.detection.*}.
 *
 * <p>query-service reads the same environment variables to describe these rules on the console's
 * topology screen, so a change here is reflected there without a UI rebuild.
 *
 * @param maxTemperature temperature readings above this are flagged
 * @param minTemperature temperature readings below this are flagged
 * @param spikeRatio     relative change against the device's previous reading above which a value is
 *                       flagged as a spike ({@code 0.5} = 50%), checked for every metric
 * @param metricRanges   safe operating bands for metrics other than temperature, keyed by metric name
 *                       (e.g. {@code humidity}, {@code pressure}). A metric with no entry here still
 *                       gets spike detection, just no absolute-range check.
 */
@ConfigurationProperties(prefix = "pulsestream.detection")
public record AnomalyDetectionProperties(
        BigDecimal maxTemperature,
        BigDecimal minTemperature,
        BigDecimal spikeRatio,
        Map<String, MetricRange> metricRanges) {

    public AnomalyDetectionProperties {
        if (maxTemperature == null || minTemperature == null || spikeRatio == null) {
            throw new IllegalArgumentException(
                    "pulsestream.detection.max-temperature, min-temperature and spike-ratio must be set");
        }
        if (minTemperature.compareTo(maxTemperature) >= 0) {
            throw new IllegalArgumentException("pulsestream.detection.min-temperature must be below max-temperature");
        }
        if (spikeRatio.signum() <= 0) {
            throw new IllegalArgumentException("pulsestream.detection.spike-ratio must be positive");
        }
        metricRanges = metricRanges == null ? Map.of() : Map.copyOf(metricRanges);
    }

    /**
     * A safe operating band for one non-temperature metric. Either bound may be {@code null} when
     * only one direction is meaningful (vibration and CO2 have no dangerous "too low" side).
     *
     * @param min readings below this are flagged; {@code null} to not check a lower bound
     * @param max readings above this are flagged; {@code null} to not check an upper bound
     */
    public record MetricRange(BigDecimal min, BigDecimal max) {
        public MetricRange {
            if (min == null && max == null) {
                throw new IllegalArgumentException("a pulsestream.detection.metric-ranges entry must set min, max, or both");
            }
            if (min != null && max != null && min.compareTo(max) >= 0) {
                throw new IllegalArgumentException("a pulsestream.detection.metric-ranges entry's min must be below its max");
            }
        }
    }
}
