package com.pulsestream.query.dto;

import com.pulsestream.query.config.PlatformProperties;
import com.pulsestream.query.config.QueryProperties;
import com.pulsestream.query.config.TopologyProperties;
import java.math.BigDecimal;
import java.util.List;

/**
 * Settings the console renders or behaves by, so they are not baked into the UI bundle. Durations are
 * whole milliseconds.
 */
public record PlatformConfigDto(
        String environment,
        long staleAfterMs,
        long autoRefreshMs,
        long readingsRefreshMs,
        int maxPageSize,
        Kafka kafka,
        Detection detection) {

    public record Kafka(Topics topics, Producer producer, Consumer consumer) {
    }

    public record Topics(String raw, String processed, String anomalies, String dlq) {
    }

    public record Producer(String acknowledgements, int retries, long publishTimeoutMs, long deliveryTimeoutMs) {
    }

    public record Consumer(
            String group,
            String ackMode,
            String autoOffsetReset,
            int concurrency,
            String dlqGroup,
            long dlqReplayIdleTimeoutMs) {
    }

    public record Detection(
            BigDecimal maxTemperature,
            BigDecimal minTemperature,
            BigDecimal spikeRatio,
            List<String> severities) {
    }

    public static PlatformConfigDto from(PlatformProperties platform, QueryProperties query, TopologyProperties topology) {
        PlatformProperties.Topics topics = platform.topics();
        PlatformProperties.Producer producer = platform.producer();
        PlatformProperties.Consumer consumer = platform.consumer();
        PlatformProperties.Detection detection = platform.detection();
        return new PlatformConfigDto(
                platform.environment(),
                platform.staleAfter().toMillis(),
                platform.autoRefresh().toMillis(),
                platform.readingsRefresh().toMillis(),
                query.maxPageSize(),
                new Kafka(
                        new Topics(topics.raw(), topics.processed(), topics.anomalies(), topics.dlq()),
                        new Producer(
                                producer.acknowledgements(),
                                producer.retries(),
                                producer.publishTimeout().toMillis(),
                                producer.deliveryTimeout().toMillis()),
                        new Consumer(
                                topology.primaryGroup(),
                                consumer.ackMode(),
                                consumer.autoOffsetReset(),
                                consumer.concurrency(),
                                consumer.dlqGroupId(),
                                consumer.dlqReplayIdleTimeout().toMillis())),
                new Detection(
                        detection.maxTemperature(),
                        detection.minTemperature(),
                        detection.spikeRatio(),
                        detection.severities()));
    }
}
