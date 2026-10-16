package com.pulsestream.query.controller;

import com.pulsestream.query.config.PlatformProperties;
import com.pulsestream.query.config.QueryProperties;
import com.pulsestream.query.config.TopologyProperties;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.web.servlet.MockMvc;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@WebMvcTest(PlatformController.class)
@EnableConfigurationProperties({PlatformProperties.class, QueryProperties.class, TopologyProperties.class})
@TestPropertySource(properties = {
        "pulsestream.platform.environment=Staging",
        "pulsestream.platform.stale-after=10m",
        "pulsestream.platform.detection.max-temperature=95",
        "pulsestream.topology.primary-group=processor-blue"
})
class PlatformControllerTest {

    @Autowired
    private MockMvc mockMvc;

    @Test
    void configReflectsTheBoundProperties() throws Exception {
        mockMvc.perform(get("/api/v1/platform/config"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.environment").value("Staging"))
                .andExpect(jsonPath("$.staleAfterMs").value(600_000))
                .andExpect(jsonPath("$.autoRefreshMs").value(30_000))
                .andExpect(jsonPath("$.maxPageSize").value(500))
                .andExpect(jsonPath("$.kafka.topics.raw").value("telemetry.events.raw"))
                .andExpect(jsonPath("$.kafka.topics.dlq").value("telemetry.events.dlq"))
                .andExpect(jsonPath("$.kafka.producer.acknowledgements").value("all"))
                .andExpect(jsonPath("$.kafka.producer.deliveryTimeoutMs").value(30_000))
                .andExpect(jsonPath("$.kafka.consumer.group").value("processor-blue"))
                .andExpect(jsonPath("$.kafka.consumer.dlqGroup").value("telemetry-processor-dlq-replay"))
                .andExpect(jsonPath("$.detection.maxTemperature").value(95))
                .andExpect(jsonPath("$.detection.minTemperature").value(-40))
                .andExpect(jsonPath("$.detection.spikeRatio").value(0.5))
                .andExpect(jsonPath("$.detection.severities[2]").value("CRITICAL"));
    }
}
