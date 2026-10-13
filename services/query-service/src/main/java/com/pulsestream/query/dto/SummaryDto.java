package com.pulsestream.query.dto;

import java.time.Instant;

/**
 * Headline counters for the dashboard landing view.
 */
public record SummaryDto(
        String tenantId,
        long processedEvents,
        long anomalies,
        long devices,
        Instant latestEventTimestamp) {
}
