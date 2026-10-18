package com.pulsestream.query.dto;

import java.math.BigDecimal;
import java.time.Instant;

/**
 * One point of a metric time series.
 */
public record SeriesPointDto(Instant timestamp, BigDecimal value) {
}
