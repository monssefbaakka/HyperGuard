package com.pulsestream.query.config;

import java.time.Duration;
import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * Settings for the Kafka topology view, bound from {@code pulsestream.topology.*}.
 *
 * @param bootstrapServers brokers the AdminClient connects to
 * @param topicPrefix      only topics starting with this prefix are described
 * @param primaryGroup     consumer group whose committed offsets and lag are reported per partition
 * @param timeout          per-call ceiling, so an unreachable broker fails fast instead of hanging
 *                         the request thread
 */
@ConfigurationProperties(prefix = "pulsestream.topology")
public record TopologyProperties(
        String bootstrapServers,
        String topicPrefix,
        String primaryGroup,
        Duration timeout) {

    public TopologyProperties {
        if (bootstrapServers == null || bootstrapServers.isBlank()) {
            throw new IllegalArgumentException("pulsestream.topology.bootstrap-servers must be set");
        }
        topicPrefix = topicPrefix == null ? "" : topicPrefix;
        if (timeout == null || timeout.isNegative() || timeout.isZero()) {
            throw new IllegalArgumentException("pulsestream.topology.timeout must be positive");
        }
    }
}
