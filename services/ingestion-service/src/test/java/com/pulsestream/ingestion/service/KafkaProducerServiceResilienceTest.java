package com.pulsestream.ingestion.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.pulsestream.ingestion.config.PulsestreamKafkaProperties;
import com.pulsestream.ingestion.exception.TelemetryPublishingException;
import com.pulsestream.ingestion.exception.TelemetryPublishingRejectedException;
import com.pulsestream.ingestion.model.TelemetryEvent;
import com.pulsestream.ingestion.model.TelemetryPayload;
import com.pulsestream.ingestion.resilience.BrokerFailurePredicate;
import io.github.resilience4j.bulkhead.Bulkhead;
import io.github.resilience4j.bulkhead.BulkheadConfig;
import io.github.resilience4j.circuitbreaker.CircuitBreaker;
import io.github.resilience4j.circuitbreaker.CircuitBreakerConfig;
import java.math.BigDecimal;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.concurrent.CompletableFuture;
import org.apache.kafka.common.KafkaException;
import org.apache.kafka.common.errors.SerializationException;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.kafka.core.KafkaTemplate;
import org.springframework.kafka.support.SendResult;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class KafkaProducerServiceResilienceTest {

    private static final Duration OPEN_WAIT = Duration.ofSeconds(15);

    @SuppressWarnings("unchecked")
    private final KafkaTemplate<String, TelemetryEvent> kafkaTemplate = mock(KafkaTemplate.class);

    @SuppressWarnings("unchecked")
    private final KafkaTemplate<String, String> dlqKafkaTemplate = mock(KafkaTemplate.class);

    private final PulsestreamKafkaProperties kafkaProperties = new PulsestreamKafkaProperties();

    private final CircuitBreaker circuitBreaker = CircuitBreaker.of(
            KafkaProducerService.KAFKA_PUBLISH,
            CircuitBreakerConfig.custom()
                    .slidingWindowSize(4)
                    .minimumNumberOfCalls(4)
                    .failureRateThreshold(50)
                    .waitDurationInOpenState(OPEN_WAIT)
                    .recordException(new BrokerFailurePredicate())
                    .build()
    );

    private final Bulkhead bulkhead = Bulkhead.of(
            KafkaProducerService.KAFKA_PUBLISH,
            BulkheadConfig.custom()
                    .maxConcurrentCalls(1)
                    .maxWaitDuration(Duration.ZERO)
                    .build()
    );

    private final KafkaProducerService service = new KafkaProducerService(
            kafkaTemplate,
            dlqKafkaTemplate,
            new ObjectMapper().findAndRegisterModules(),
            kafkaProperties,
            Clock.fixed(Instant.parse("2026-04-01T09:30:00Z"), ZoneOffset.UTC),
            circuitBreaker,
            bulkhead
    );

    @Test
    @DisplayName("should open the circuit breaker after repeated broker failures")
    void shouldOpenCircuitBreakerAfterRepeatedBrokerFailures() {
        TelemetryEvent event = telemetryEvent();
        when(kafkaTemplate.send(anyString(), anyString(), any(TelemetryEvent.class)))
                .thenAnswer(invocation -> failedFuture(new KafkaException("broker unavailable")));
        when(dlqKafkaTemplate.send(anyString(), anyString(), anyString()))
                .thenAnswer(invocation -> failedFuture(new KafkaException("broker unavailable")));

        for (int i = 0; i < 4; i++) {
            assertThatThrownBy(() -> service.publishTelemetryEvent(event))
                    .isExactlyInstanceOf(TelemetryPublishingException.class);
        }

        assertThat(circuitBreaker.getState()).isEqualTo(CircuitBreaker.State.OPEN);
    }

    @Test
    @DisplayName("should fail fast without touching Kafka or the DLQ while the breaker is open")
    void shouldFailFastWhileCircuitBreakerIsOpen() {
        circuitBreaker.transitionToOpenState();

        assertThatThrownBy(() -> service.publishTelemetryEvent(telemetryEvent()))
                .isInstanceOf(TelemetryPublishingRejectedException.class)
                .satisfies(ex -> assertThat(((TelemetryPublishingRejectedException) ex).getRetryAfter())
                        .isEqualTo(OPEN_WAIT));

        verify(kafkaTemplate, never()).send(anyString(), anyString(), any(TelemetryEvent.class));
        verify(dlqKafkaTemplate, never()).send(anyString(), anyString(), anyString());
    }

    @Test
    @DisplayName("should not open the breaker for record-level serialization failures")
    void shouldNotOpenCircuitBreakerForSerializationFailures() {
        TelemetryEvent event = telemetryEvent();
        when(kafkaTemplate.send(anyString(), anyString(), any(TelemetryEvent.class)))
                .thenThrow(new SerializationException("cannot serialize"));
        when(dlqKafkaTemplate.send(anyString(), anyString(), anyString()))
                .thenAnswer(invocation -> completedFuture());

        for (int i = 0; i < 6; i++) {
            assertThatThrownBy(() -> service.publishTelemetryEvent(event))
                    .isExactlyInstanceOf(TelemetryPublishingException.class);
        }

        assertThat(circuitBreaker.getState()).isEqualTo(CircuitBreaker.State.CLOSED);
        verify(dlqKafkaTemplate, times(6))
                .send(eq(kafkaProperties.getTopics().getDlq()), eq("evt-001"), anyString());
    }

    @Test
    @DisplayName("should reject the publish when the bulkhead is saturated")
    void shouldRejectWhenBulkheadIsSaturated() {
        // Hold the only permit, as an in-flight publish blocked on Kafka would.
        assertThat(bulkhead.tryAcquirePermission()).isTrue();
        try {
            assertThatThrownBy(() -> service.publishTelemetryEvent(telemetryEvent()))
                    .isInstanceOf(TelemetryPublishingRejectedException.class)
                    .satisfies(ex -> assertThat(((TelemetryPublishingRejectedException) ex).getRetryAfter())
                            .isEqualTo(Duration.ofSeconds(1)));
        } finally {
            bulkhead.onComplete();
        }

        verify(kafkaTemplate, never()).send(anyString(), anyString(), any(TelemetryEvent.class));
        // Back-pressure rejections must not count as broker failures.
        assertThat(circuitBreaker.getMetrics().getNumberOfFailedCalls()).isZero();
    }

    @Test
    @DisplayName("should publish normally while the breaker is closed")
    void shouldPublishNormallyWhileClosed() {
        TelemetryEvent event = telemetryEvent();
        when(kafkaTemplate.send(kafkaProperties.getTopics().getRaw(), "evt-001", event))
                .thenAnswer(invocation -> completedFuture());

        service.publishTelemetryEvent(event);

        assertThat(circuitBreaker.getMetrics().getNumberOfSuccessfulCalls()).isEqualTo(1);
        assertThat(bulkhead.getMetrics().getAvailableConcurrentCalls()).isEqualTo(1);
    }

    private static <V> CompletableFuture<SendResult<String, V>> failedFuture(Throwable cause) {
        CompletableFuture<SendResult<String, V>> future = new CompletableFuture<>();
        future.completeExceptionally(cause);
        return future;
    }

    @SuppressWarnings("unchecked")
    private static <V> CompletableFuture<SendResult<String, V>> completedFuture() {
        return CompletableFuture.completedFuture(mock(SendResult.class));
    }

    private static TelemetryEvent telemetryEvent() {
        return new TelemetryEvent(
                "evt-001",
                "factory-01",
                "telemetry.reading",
                Instant.parse("2026-03-31T12:00:00Z"),
                "sensor-gateway",
                "1.0",
                new TelemetryPayload(
                        "sensor-1042",
                        "temperature-sensor",
                        "temperature",
                        new BigDecimal("28.4"),
                        "C",
                        "zone-a"
                )
        );
    }
}
