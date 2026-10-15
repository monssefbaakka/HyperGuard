package com.pulsestream.query.controller;

import com.pulsestream.query.dto.AnomalyRecordDto;
import com.pulsestream.query.dto.PageResponseDto;
import com.pulsestream.query.service.AnomalyQueryService;
import java.time.Instant;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * Read endpoints over persisted anomaly records.
 */
@RestController
@RequestMapping("/api/v1/anomalies")
public class AnomalyQueryController {

    private final AnomalyQueryService anomalyQueryService;

    public AnomalyQueryController(AnomalyQueryService anomalyQueryService) {
        this.anomalyQueryService = anomalyQueryService;
    }

    @GetMapping
    public PageResponseDto<AnomalyRecordDto> search(
            @RequestParam(required = false) String tenantId,
            @RequestParam(required = false) String deviceId,
            @RequestParam(required = false) String metric,
            @RequestParam(required = false) String severity,
            @RequestParam(required = false) String anomalyType,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) Instant from,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) Instant to,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "50") int size,
            @RequestParam(defaultValue = "timestamp") String sort,
            @RequestParam(defaultValue = "desc") String direction) {

        return anomalyQueryService.search(
                tenantId,
                deviceId,
                metric,
                severity,
                anomalyType,
                from,
                to,
                page,
                size,
                sort,
                SortDirections.parse(direction));
    }
}
