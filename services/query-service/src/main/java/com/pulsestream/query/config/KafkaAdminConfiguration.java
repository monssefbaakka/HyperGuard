package com.pulsestream.query.config;

import java.util.Map;
import org.apache.kafka.clients.admin.Admin;
import org.apache.kafka.clients.admin.AdminClientConfig;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/**
 * The single read-only {@link Admin} client behind the topology view.
 *
 * <p>Timeouts are deliberately short and retries disabled: this client serves a browser request, so a
 * broker that is down should surface as "unavailable" within a second or two rather than holding the
 * request thread for the driver's minute-long defaults.
 */
@Configuration
public class KafkaAdminConfiguration {

    @Bean(destroyMethod = "close")
    public Admin kafkaAdmin(TopologyProperties properties) {
        long timeoutMs = properties.timeout().toMillis();
        return Admin.create(Map.of(
                AdminClientConfig.BOOTSTRAP_SERVERS_CONFIG, properties.bootstrapServers(),
                AdminClientConfig.REQUEST_TIMEOUT_MS_CONFIG, (int) timeoutMs,
                AdminClientConfig.DEFAULT_API_TIMEOUT_MS_CONFIG, (int) timeoutMs,
                AdminClientConfig.RETRIES_CONFIG, 0,
                AdminClientConfig.CLIENT_ID_CONFIG, "query-service-topology"));
    }
}
