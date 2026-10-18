package com.pulsestream.query.config;

import java.util.List;
import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * Tunables for the read API, bound from {@code pulsestream.query.*}.
 *
 * @param maxPageSize     largest page a client may request on the paged endpoints
 * @param maxSeriesPoints largest number of points the time-series endpoint returns
 * @param corsAllowedOrigins browser origins permitted to call the API
 */
@ConfigurationProperties(prefix = "pulsestream.query")
public record QueryProperties(
        int maxPageSize,
        int maxSeriesPoints,
        List<String> corsAllowedOrigins) {

    public QueryProperties {
        if (maxPageSize <= 0) {
            throw new IllegalArgumentException("pulsestream.query.max-page-size must be positive");
        }
        if (maxSeriesPoints <= 0) {
            throw new IllegalArgumentException("pulsestream.query.max-series-points must be positive");
        }
        corsAllowedOrigins = corsAllowedOrigins == null ? List.of() : List.copyOf(corsAllowedOrigins);
    }
}
