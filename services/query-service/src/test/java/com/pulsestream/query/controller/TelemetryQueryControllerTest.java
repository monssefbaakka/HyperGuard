package com.pulsestream.query.controller;

import com.pulsestream.query.config.QueryProperties;
import com.pulsestream.query.dto.MetricSeriesDto;
import com.pulsestream.query.dto.PageResponseDto;
import com.pulsestream.query.dto.SeriesPointDto;
import com.pulsestream.query.dto.TelemetryRecordDto;
import com.pulsestream.query.service.TelemetryQueryService;
import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.data.domain.Sort;
import org.springframework.test.web.servlet.MockMvc;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@WebMvcTest(TelemetryQueryController.class)
// WebConfiguration is a WebMvcConfigurer, so the slice instantiates it and needs its properties;
// binding them here also exercises the CORS allow-list the web UI depends on.
@EnableConfigurationProperties(QueryProperties.class)
class TelemetryQueryControllerTest {

    @Autowired
    private MockMvc mockMvc;

    @MockBean
    private TelemetryQueryService telemetryQueryService;

    @Test
    void searchBindsFiltersPagingAndSortOntoTheQuery() throws Exception {
        when(telemetryQueryService.search(
                any(), any(), any(), any(), any(), any(), anyInt(), anyInt(), any(), any()))
                .thenReturn(new PageResponseDto<>(List.of(), 1, 25, 0, 0, false));

        mockMvc.perform(get("/api/v1/telemetry")
                        .param("tenantId", "tenant-a")
                        .param("deviceId", "device-1")
                        .param("metric", "temperature")
                        .param("eventType", "telemetry.processed")
                        .param("from", "2026-09-01T10:00:00Z")
                        .param("to", "2026-09-01T11:00:00Z")
                        .param("page", "1")
                        .param("size", "25")
                        .param("sort", "value")
                        .param("direction", "asc"))
                .andExpect(status().isOk());

        ArgumentCaptor<Instant> from = ArgumentCaptor.forClass(Instant.class);
        ArgumentCaptor<Instant> to = ArgumentCaptor.forClass(Instant.class);

        verify(telemetryQueryService).search(
                eq("tenant-a"),
                eq("device-1"),
                eq("temperature"),
                eq("telemetry.processed"),
                from.capture(),
                to.capture(),
                eq(1),
                eq(25),
                eq("value"),
                eq(Sort.Direction.ASC));

        assertThat(from.getValue()).isEqualTo(Instant.parse("2026-09-01T10:00:00Z"));
        assertThat(to.getValue()).isEqualTo(Instant.parse("2026-09-01T11:00:00Z"));
    }

    @Test
    void searchDefaultsToTheNewestFiftyRowsWhenNoParametersAreGiven() throws Exception {
        when(telemetryQueryService.search(
                any(), any(), any(), any(), any(), any(), anyInt(), anyInt(), any(), any()))
                .thenReturn(new PageResponseDto<>(
                        List.of(new TelemetryRecordDto(
                                "evt-1",
                                "tenant-a",
                                "telemetry.processed",
                                Instant.parse("2026-09-01T10:00:00Z"),
                                "ingestion-service",
                                "device-1",
                                "sensor",
                                "temperature",
                                new BigDecimal("20.5000"),
                                "C",
                                "warehouse-1",
                                Instant.parse("2026-09-01T10:00:02Z"))),
                        0, 50, 1, 1, false));

        mockMvc.perform(get("/api/v1/telemetry"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.content[0].eventId").value("evt-1"))
                .andExpect(jsonPath("$.content[0].value").value(20.5))
                .andExpect(jsonPath("$.totalElements").value(1));

        verify(telemetryQueryService).search(
                null, null, null, null, null, null, 0, 50, "timestamp", Sort.Direction.DESC);
    }

    @Test
    void malformedInstantIsRejectedWithAFieldLevelBadRequest() throws Exception {
        mockMvc.perform(get("/api/v1/telemetry").param("from", "yesterday"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.status").value(400))
                .andExpect(jsonPath("$.path").value("/api/v1/telemetry"))
                .andExpect(jsonPath("$.errors[0].field").value("from"))
                .andExpect(jsonPath("$.errors[0].message").value(
                        org.hamcrest.Matchers.containsString("ISO-8601")));
    }

    @Test
    void unsupportedSortDirectionIsRejectedBeforeReachingTheService() throws Exception {
        mockMvc.perform(get("/api/v1/telemetry").param("direction", "sideways"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message").value(
                        org.hamcrest.Matchers.containsString("Unsupported sort direction")));
    }

    @Test
    void seriesRequiresBothTheDeviceAndTheMetric() throws Exception {
        mockMvc.perform(get("/api/v1/telemetry/series").param("deviceId", "device-1"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.errors[0].field").value("metric"));
    }

    @Test
    void allowedBrowserOriginGetsCorsHeadersOnThePreflight() throws Exception {
        mockMvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders
                        .options("/api/v1/telemetry")
                        .header("Origin", "http://localhost:5173")
                        .header("Access-Control-Request-Method", "GET"))
                .andExpect(status().isOk())
                .andExpect(org.springframework.test.web.servlet.result.MockMvcResultMatchers
                        .header().string("Access-Control-Allow-Origin", "http://localhost:5173"));
    }

    @Test
    void unknownBrowserOriginIsRefusedByThePreflight() throws Exception {
        mockMvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders
                        .options("/api/v1/telemetry")
                        .header("Origin", "http://evil.example")
                        .header("Access-Control-Request-Method", "GET"))
                .andExpect(status().isForbidden());
    }

    @Test
    void seriesReturnsThePointsForTheRequestedDeviceAndMetric() throws Exception {
        when(telemetryQueryService.series(any(), eq("device-1"), eq("temperature"), any(), any(), anyInt()))
                .thenReturn(new MetricSeriesDto(
                        "device-1",
                        "temperature",
                        "C",
                        List.of(new SeriesPointDto(Instant.parse("2026-09-01T10:00:00Z"), new BigDecimal("20.5000"))),
                        true));

        mockMvc.perform(get("/api/v1/telemetry/series")
                        .param("deviceId", "device-1")
                        .param("metric", "temperature"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.unit").value("C"))
                .andExpect(jsonPath("$.truncated").value(true))
                .andExpect(jsonPath("$.points[0].value").value(20.5));
    }
}
