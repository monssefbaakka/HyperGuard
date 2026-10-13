package com.pulsestream.query.dto;

import java.util.List;

/**
 * A metric time series for a single device, ordered oldest to newest so charts can plot it directly.
 *
 * <p>{@code truncated} tells the caller that the window held more points than the configured
 * maximum and that the newest ones were kept, so the chart can label itself honestly instead of
 * implying it shows the whole window.
 */
public record MetricSeriesDto(
        String deviceId,
        String metric,
        String unit,
        List<SeriesPointDto> points,
        boolean truncated) {
}
