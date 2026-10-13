package com.pulsestream.query.config;

import java.time.Duration;
import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * Console sign-in tunables, bound from {@code pulsestream.auth.*}.
 *
 * @param sessionTtl          how long a session token stays valid after sign-in
 * @param registrationEnabled whether anyone reaching the console may create an account
 * @param maxAvatarBytes      largest profile photo accepted, after the browser has resized it
 */
@ConfigurationProperties(prefix = "pulsestream.auth")
public record AuthProperties(
        Duration sessionTtl,
        boolean registrationEnabled,
        int maxAvatarBytes) {

    public AuthProperties {
        sessionTtl = sessionTtl == null ? Duration.ofHours(12) : sessionTtl;
        if (sessionTtl.isNegative() || sessionTtl.isZero()) {
            throw new IllegalArgumentException("pulsestream.auth.session-ttl must be positive");
        }
        maxAvatarBytes = maxAvatarBytes <= 0 ? 1_048_576 : maxAvatarBytes;
    }
}
