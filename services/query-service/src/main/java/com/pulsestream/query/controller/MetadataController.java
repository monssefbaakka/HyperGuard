package com.pulsestream.query.controller;

import com.pulsestream.query.dto.ActivityBucketDto;
import com.pulsestream.query.dto.DeviceSummaryDto;
import com.pulsestream.query.dto.FacetsDto;
import com.pulsestream.query.dto.SummaryDto;
import com.pulsestream.query.service.PlatformMetadataService;
import java.time.Instant;
import java.util.List;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * Endpoints that describe what is in the store rather than returning the rows themselves.
 */
@RestController
@RequestMapping("/api/v1")
public class MetadataController {

    private final PlatformMetadataService platformMetadataService;

    public MetadataController(PlatformMetadataService platformMetadataService) {
        this.platformMetadataService = platformMetadataService;
    }

    /**
     * Distinct values available for the UI filter controls.
     */
    @GetMapping("/facets")
    public FacetsDto facets(@RequestParam(required = false) String tenantId) {
        return platformMetadataService.facets(tenantId);
    }

    /**
     * Headline counters for the dashboard.
     */
    @GetMapping("/summary")
    public SummaryDto summary(@RequestParam(required = false) String tenantId) {
        return platformMetadataService.summary(tenantId);
    }

    /**
     * Readings per hour over a window, defaulting to the last 24 hours. Quiet hours are returned as
     * zero rather than omitted.
     */
    @GetMapping("/activity")
    public List<ActivityBucketDto> activity(
            @RequestParam(required = false) String tenantId,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) Instant from,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) Instant to) {
        return platformMetadataService.hourlyActivity(tenantId, from, to);
    }

    /**
     * Each device with its most recent reading, most recently active first.
     */
    @GetMapping("/devices")
    public List<DeviceSummaryDto> devices(
            @RequestParam(required = false) String tenantId,
            @RequestParam(defaultValue = "12") int limit) {
        return platformMetadataService.devices(tenantId, limit);
    }
}
