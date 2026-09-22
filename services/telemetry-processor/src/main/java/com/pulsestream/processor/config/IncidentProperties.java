package com.pulsestream.processor.config;

import java.time.Duration;
import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * Incident correlation and device quarantine, bound from {@code pulsestream.incidents.*}.
 *
 * @param correlationWindow an anomaly joins the device's active incident when it lands within this
 *                          long of that incident's previous anomaly; later anomalies open a new incident
 * @param quarantineRefresh how long the list of quarantined devices is cached before it is read again,
 *                          which bounds how quickly a quarantine or release takes effect
 */
@ConfigurationProperties(prefix = "pulsestream.incidents")
public record IncidentProperties(Duration correlationWindow, Duration quarantineRefresh) {

    public IncidentProperties {
        if (correlationWindow == null) {
            correlationWindow = Duration.ofMinutes(15);
        }
        if (quarantineRefresh == null) {
            quarantineRefresh = Duration.ofSeconds(5);
        }
        if (correlationWindow.isNegative() || correlationWindow.isZero()) {
            throw new IllegalArgumentException("pulsestream.incidents.correlation-window must be positive");
        }
        if (quarantineRefresh.isNegative()) {
            throw new IllegalArgumentException("pulsestream.incidents.quarantine-refresh must not be negative");
        }
    }
}
