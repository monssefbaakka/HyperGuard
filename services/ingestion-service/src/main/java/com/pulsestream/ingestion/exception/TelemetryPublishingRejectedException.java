package com.pulsestream.ingestion.exception;

import java.time.Duration;

/**
 * Raised when a publish is refused before reaching Kafka, because the circuit breaker
 * is open or the publish bulkhead is saturated. Nothing was sent, so the client should
 * retry after {@link #getRetryAfter()}.
 */
public class TelemetryPublishingRejectedException extends TelemetryPublishingException {

    private final Duration retryAfter;

    public TelemetryPublishingRejectedException(String message, Duration retryAfter, Throwable cause) {
        super(message, cause);
        this.retryAfter = retryAfter;
    }

    public Duration getRetryAfter() {
        return retryAfter;
    }
}
