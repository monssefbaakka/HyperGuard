package com.pulsestream.query.controller;

import com.pulsestream.query.dto.MetricSeriesDto;
import com.pulsestream.query.dto.PageResponseDto;
import com.pulsestream.query.dto.TelemetryRecordDto;
import com.pulsestream.query.service.TelemetryQueryService;
import java.time.Instant;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * Read endpoints over persisted processed telemetry.
 */
@RestController
@RequestMapping("/api/v1/telemetry")
public class TelemetryQueryController {

    private final TelemetryQueryService telemetryQueryService;

    public TelemetryQueryController(TelemetryQueryService telemetryQueryService) {
        this.telemetryQueryService = telemetryQueryService;
    }

    /**
     * Returns a filtered, paged slice of processed telemetry, newest first by default.
     */
    @GetMapping
    public PageResponseDto<TelemetryRecordDto> search(
            @RequestParam(required = false) String tenantId,
            @RequestParam(required = false) String deviceId,
            @RequestParam(required = false) String metric,
            @RequestParam(required = false) String eventType,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) Instant from,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) Instant to,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "50") int size,
            @RequestParam(defaultValue = "timestamp") String sort,
            @RequestParam(defaultValue = "desc") String direction) {

        return telemetryQueryService.search(
                tenantId,
                deviceId,
                metric,
                eventType,
                from,
                to,
                page,
                size,
                sort,
                SortDirections.parse(direction));
    }

    /**
     * Returns the value series for one device/metric pair, ordered oldest to newest for charting.
     */
    @GetMapping("/series")
    public MetricSeriesDto series(
            @RequestParam(required = false) String tenantId,
            @RequestParam String deviceId,
            @RequestParam String metric,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) Instant from,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) Instant to,
            @RequestParam(defaultValue = "0") int limit) {

        return telemetryQueryService.series(tenantId, deviceId, metric, from, to, limit);
    }
}
