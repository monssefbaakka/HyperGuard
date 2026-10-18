package com.pulsestream.query.config;

import java.math.BigDecimal;
import java.time.Duration;
import java.util.List;
import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * Platform settings the console displays or behaves by, bound from {@code pulsestream.platform.*}.
 *
 * <p>The Kafka and detection groups describe settings that ingestion-service and telemetry-processor
 * own. application.yml binds them from the same environment variables those services read, so one
 * override applies to every service.
 *
 * @param environment     label for the deployment shown in the console header
 * @param staleAfter      a device or incident with nothing newer than this is treated as quiet
 * @param autoRefresh     how often the console refreshes its views while live updates are on
 * @param readingsRefresh how often the fleet readings screen polls on its own
 * @param topics          Kafka topic names used by the pipeline
 * @param producer        ingestion-service producer settings
 * @param consumer        telemetry-processor consumer settings
 * @param detection       telemetry-processor anomaly rules
 */
@ConfigurationProperties(prefix = "pulsestream.platform")
public record PlatformProperties(
        String environment,
        Duration staleAfter,
        Duration autoRefresh,
        Duration readingsRefresh,
        Topics topics,
        Producer producer,
        Consumer consumer,
        Detection detection) {

    public PlatformProperties {
        environment = environment == null ? "" : environment;
        requirePositive(staleAfter, "stale-after");
        requirePositive(autoRefresh, "auto-refresh");
        requirePositive(readingsRefresh, "readings-refresh");
        requireSet(topics, "topics");
        requireSet(producer, "producer");
        requireSet(consumer, "consumer");
        requireSet(detection, "detection");
    }

    /**
     * @param raw       topic ingestion-service publishes accepted events to
     * @param processed topic telemetry-processor publishes normalized events to
     * @param anomalies topic telemetry-processor publishes flagged events to
     * @param dlq       dead-letter topic
     */
    public record Topics(String raw, String processed, String anomalies, String dlq) {

        public Topics {
            requireText(raw, "topics.raw");
            requireText(processed, "topics.processed");
            requireText(anomalies, "topics.anomalies");
            requireText(dlq, "topics.dlq");
        }
    }

    public record Producer(String acknowledgements, int retries, Duration publishTimeout, Duration deliveryTimeout) {

        public Producer {
            requireText(acknowledgements, "producer.acknowledgements");
            requirePositive(publishTimeout, "producer.publish-timeout");
            requirePositive(deliveryTimeout, "producer.delivery-timeout");
        }
    }

    public record Consumer(
            String ackMode,
            String autoOffsetReset,
            int concurrency,
            String dlqGroupId,
            Duration dlqReplayIdleTimeout) {

        public Consumer {
            requireText(ackMode, "consumer.ack-mode");
            requireText(autoOffsetReset, "consumer.auto-offset-reset");
            requireText(dlqGroupId, "consumer.dlq-group-id");
            requirePositive(dlqReplayIdleTimeout, "consumer.dlq-replay-idle-timeout");
        }
    }

    /**
     * @param severities anomaly severities from least to most severe, as the processor records them
     */
    public record Detection(
            BigDecimal maxTemperature,
            BigDecimal minTemperature,
            BigDecimal spikeRatio,
            List<String> severities) {

        public Detection {
            requireSet(maxTemperature, "detection.max-temperature");
            requireSet(minTemperature, "detection.min-temperature");
            requireSet(spikeRatio, "detection.spike-ratio");
            severities = severities == null ? List.of() : List.copyOf(severities);
        }
    }

    private static void requireSet(Object value, String name) {
        if (value == null) {
            throw new IllegalArgumentException("pulsestream.platform." + name + " must be set");
        }
    }

    private static void requireText(String value, String name) {
        if (value == null || value.isBlank()) {
            throw new IllegalArgumentException("pulsestream.platform." + name + " must be set");
        }
    }

    private static void requirePositive(Duration value, String name) {
        if (value == null || value.isNegative() || value.isZero()) {
            throw new IllegalArgumentException("pulsestream.platform." + name + " must be positive");
        }
    }
}
