package com.pulsestream.query.controller;

import com.pulsestream.query.dto.KafkaTopologyDto;
import com.pulsestream.query.service.KafkaTopologyService;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * Read-only description of the streaming tier for the topology screen.
 */
@RestController
@RequestMapping("/api/v1/topology")
public class TopologyController {

    private final KafkaTopologyService kafkaTopologyService;

    public TopologyController(KafkaTopologyService kafkaTopologyService) {
        this.kafkaTopologyService = kafkaTopologyService;
    }

    /**
     * Live topics, partitions, replication and consumer-group lag as the broker reports them.
     *
     * <p>Answers 200 with {@code available: false} when the cluster is unreachable — an unreachable
     * broker is a state the console renders, not a failure of this endpoint.
     */
    @GetMapping("/kafka")
    public KafkaTopologyDto kafka() {
        return kafkaTopologyService.describe();
    }
}
