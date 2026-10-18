package com.pulsestream.query.controller;

import com.pulsestream.query.config.QueryProperties;
import com.pulsestream.query.dto.ActivityBucketDto;
import com.pulsestream.query.dto.DeviceSummaryDto;
import com.pulsestream.query.dto.FacetsDto;
import com.pulsestream.query.dto.SummaryDto;
import com.pulsestream.query.service.PlatformMetadataService;
import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.test.web.servlet.MockMvc;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@WebMvcTest(MetadataController.class)
@EnableConfigurationProperties(QueryProperties.class)
class MetadataControllerTest {

    @Autowired
    private MockMvc mockMvc;

    @MockBean
    private PlatformMetadataService platformMetadataService;

    @Test
    void facetsAreReturnedForTheRequestedTenant() throws Exception {
        when(platformMetadataService.facets("tenant-a")).thenReturn(new FacetsDto(
                List.of("tenant-a", "tenant-b"),
                List.of("device-1"),
                List.of("temperature"),
                List.of("telemetry.processed"),
                List.of("CRITICAL"),
                List.of("THRESHOLD_BREACH")));

        mockMvc.perform(get("/api/v1/facets").param("tenantId", "tenant-a"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.tenants[1]").value("tenant-b"))
                .andExpect(jsonPath("$.devices[0]").value("device-1"))
                .andExpect(jsonPath("$.anomalySeverities[0]").value("CRITICAL"));
    }

    @Test
    void activityDefaultsToTheServiceWindowWhenNoBoundsAreGiven() throws Exception {
        when(platformMetadataService.hourlyActivity(null, null, null)).thenReturn(List.of(
                new ActivityBucketDto(Instant.parse("2026-09-08T09:00:00Z"), 12),
                new ActivityBucketDto(Instant.parse("2026-09-08T10:00:00Z"), 0)));

        mockMvc.perform(get("/api/v1/activity"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].start").value("2026-09-08T09:00:00Z"))
                .andExpect(jsonPath("$[0].count").value(12))
                .andExpect(jsonPath("$[1].count").value(0));
    }

    @Test
    void activityPassesTheRequestedWindowThrough() throws Exception {
        when(platformMetadataService.hourlyActivity(any(), any(), any())).thenReturn(List.of());

        mockMvc.perform(get("/api/v1/activity")
                        .param("tenantId", "tenant-a")
                        .param("from", "2026-09-01T00:00:00Z")
                        .param("to", "2026-09-02T00:00:00Z"))
                .andExpect(status().isOk());

        verify(platformMetadataService).hourlyActivity(
                "tenant-a", Instant.parse("2026-09-01T00:00:00Z"), Instant.parse("2026-09-02T00:00:00Z"));
    }

    @Test
    void devicesAreReturnedWithTheDefaultLimit() throws Exception {
        when(platformMetadataService.devices(any(), anyInt())).thenReturn(List.of(new DeviceSummaryDto(
                "device-1",
                "sensor",
                "warehouse-1",
                "temperature",
                new BigDecimal("21.5000"),
                "C",
                Instant.parse("2026-09-08T10:00:00Z"),
                42)));

        mockMvc.perform(get("/api/v1/devices"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].deviceId").value("device-1"))
                .andExpect(jsonPath("$[0].lastValue").value(21.5))
                .andExpect(jsonPath("$[0].readings").value(42));

        verify(platformMetadataService).devices(null, 12);
    }

    @Test
    void devicesHonourAnExplicitLimit() throws Exception {
        when(platformMetadataService.devices(any(), anyInt())).thenReturn(List.of());

        mockMvc.perform(get("/api/v1/devices").param("tenantId", "tenant-a").param("limit", "5"))
                .andExpect(status().isOk());

        verify(platformMetadataService).devices(eq("tenant-a"), eq(5));
    }

    @Test
    void summaryIsReturnedWithoutATenantFilter() throws Exception {
        when(platformMetadataService.summary(null))
                .thenReturn(new SummaryDto(null, 42, 3, 7, Instant.parse("2026-09-01T10:00:00Z")));

        mockMvc.perform(get("/api/v1/summary"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.processedEvents").value(42))
                .andExpect(jsonPath("$.anomalies").value(3))
                .andExpect(jsonPath("$.devices").value(7))
                .andExpect(jsonPath("$.latestEventTimestamp").value("2026-09-01T10:00:00Z"));
    }
}
