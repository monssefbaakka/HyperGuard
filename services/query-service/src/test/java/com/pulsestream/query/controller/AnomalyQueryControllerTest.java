package com.pulsestream.query.controller;

import com.pulsestream.query.config.QueryProperties;
import com.pulsestream.query.dto.AnomalyRecordDto;
import com.pulsestream.query.dto.PageResponseDto;
import com.pulsestream.query.service.AnomalyQueryService;
import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.data.domain.Sort;
import org.springframework.test.web.servlet.MockMvc;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@WebMvcTest(AnomalyQueryController.class)
@EnableConfigurationProperties(QueryProperties.class)
class AnomalyQueryControllerTest {

    @Autowired
    private MockMvc mockMvc;

    @MockBean
    private AnomalyQueryService anomalyQueryService;

    @Test
    void searchBindsEveryAnomalyFilter() throws Exception {
        when(anomalyQueryService.search(
                any(), any(), any(), any(), any(), any(), any(), anyInt(), anyInt(), any(), any()))
                .thenReturn(new PageResponseDto<>(List.of(), 0, 50, 0, 0, false));

        mockMvc.perform(get("/api/v1/anomalies")
                        .param("tenantId", "tenant-a")
                        .param("deviceId", "device-1")
                        .param("metric", "temperature")
                        .param("severity", "critical")
                        .param("anomalyType", "THRESHOLD_BREACH")
                        .param("from", "2026-09-01T10:00:00Z"))
                .andExpect(status().isOk());

        verify(anomalyQueryService).search(
                "tenant-a",
                "device-1",
                "temperature",
                "critical",
                "THRESHOLD_BREACH",
                Instant.parse("2026-09-01T10:00:00Z"),
                null,
                0,
                50,
                "timestamp",
                Sort.Direction.DESC);
    }

    @Test
    void searchSerialisesTheAnomalyRecord() throws Exception {
        when(anomalyQueryService.search(
                any(), any(), any(), any(), any(), any(), any(), anyInt(), anyInt(), any(), any()))
                .thenReturn(new PageResponseDto<>(
                        List.of(new AnomalyRecordDto(
                                "evt-1",
                                "tenant-a",
                                Instant.parse("2026-09-01T10:00:00Z"),
                                "device-1",
                                "temperature",
                                new BigDecimal("80.0000"),
                                new BigDecimal("30.0000"),
                                "THRESHOLD_BREACH",
                                "CRITICAL",
                                Instant.parse("2026-09-01T10:00:02Z"))),
                        0, 50, 1, 1, false));

        mockMvc.perform(get("/api/v1/anomalies"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.content[0].severity").value("CRITICAL"))
                .andExpect(jsonPath("$.content[0].threshold").value(30.0))
                .andExpect(jsonPath("$.totalElements").value(1));
    }
}
