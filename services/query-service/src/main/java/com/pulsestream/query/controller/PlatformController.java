package com.pulsestream.query.controller;

import com.pulsestream.query.config.PlatformProperties;
import com.pulsestream.query.config.QueryProperties;
import com.pulsestream.query.config.TopologyProperties;
import com.pulsestream.query.dto.PlatformConfigDto;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * Runtime configuration the console reads instead of hardcoding.
 */
@RestController
@RequestMapping("/api/v1/platform")
public class PlatformController {

    private final PlatformConfigDto config;

    public PlatformController(PlatformProperties platform, QueryProperties query, TopologyProperties topology) {
        // Bound once at startup and immutable afterwards, so the response is built once.
        this.config = PlatformConfigDto.from(platform, query, topology);
    }

    @GetMapping("/config")
    public PlatformConfigDto config() {
        return config;
    }
}
