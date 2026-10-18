package com.pulsestream.query.dto;

import java.util.List;

/**
 * Distinct filter values present in the stored data, used to populate the UI filter controls.
 */
public record FacetsDto(
        List<String> tenants,
        List<String> devices,
        List<String> metrics,
        List<String> eventTypes,
        List<String> anomalySeverities,
        List<String> anomalyTypes) {
}
