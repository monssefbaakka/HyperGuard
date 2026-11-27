package com.pulsestream.ingestion.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.pulsestream.ingestion.config.PulsestreamKafkaProperties;
import com.pulsestream.ingestion.exception.TelemetryPublishingException;
import com.pulsestream.ingestion.exception.TelemetryPublishingRejectedException;
import com.pulsestream.ingestion.model.DeadLetterEvent;
import com.pulsestream.ingestion.model.TelemetryEvent;
import io.github.resilience4j.bulkhead.Bulkhead;
import io.github.resilience4j.bulkhead.BulkheadFullException;
import io.github.resilience4j.bulkhead.BulkheadRegistry;
import io.github.resilience4j.circuitbreaker.CallNotPermittedException;
import io.github.resilience4j.circuitbreaker.CircuitBreaker;
import io.github.resilience4j.circuitbreaker.CircuitBreakerRegistry;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.TimeoutException;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.kafka.core.KafkaTemplate;
import org.springframework.stereotype.Service;
import org.springframework.util.Assert;
import org.springframework.util.StringUtils;

@Service
public class KafkaProducerService {

    private static final Logger log = LoggerFactory.getLogger(KafkaProducerService.class);

    private static final String SOURCE_SERVICE = "ingestion-service";

    /** Name of the circuit breaker and bulkhead instances in {@code resilience4j.*} config. */
    public static final String KAFKA_PUBLISH = "kafka-publish";

    /** Retry hint returned when the bulkhead is saturated; capacity frees up quickly. */
    private static final Duration BULKHEAD_RETRY_AFTER = Duration.ofSeconds(1);

    private final KafkaTemplate<String, TelemetryEvent> telemetryKafkaTemplate;

    private final KafkaTemplate<String, String> dlqKafkaTemplate;

    private final ObjectMapper objectMapper;

    private final PulsestreamKafkaProperties kafkaProperties;

    private final Clock clock;

    private final CircuitBreaker circuitBreaker;

    private final Bulkhead bulkhead;

    @Autowired
    public KafkaProducerService(
            KafkaTemplate<String, TelemetryEvent> telemetryKafkaTemplate,
            KafkaTemplate<String, String> dlqKafkaTemplate,
            ObjectMapper objectMapper,
            PulsestreamKafkaProperties kafkaProperties,
            CircuitBreakerRegistry circuitBreakerRegistry,
            BulkheadRegistry bulkheadRegistry
    ) {
        this(
                telemetryKafkaTemplate,
                dlqKafkaTemplate,
                objectMapper,
                kafkaProperties,
                Clock.systemUTC(),
                circuitBreakerRegistry.circuitBreaker(KAFKA_PUBLISH),
                bulkheadRegistry.bulkhead(KAFKA_PUBLISH)
        );
    }

    KafkaProducerService(
            KafkaTemplate<String, TelemetryEvent> telemetryKafkaTemplate,
            KafkaTemplate<String, String> dlqKafkaTemplate,
            ObjectMapper objectMapper,
            PulsestreamKafkaProperties kafkaProperties,
            Clock clock
    ) {
        this(
                telemetryKafkaTemplate,
                dlqKafkaTemplate,
                objectMapper,
                kafkaProperties,
                clock,
                CircuitBreaker.ofDefaults(KAFKA_PUBLISH),
                Bulkhead.ofDefaults(KAFKA_PUBLISH)
        );
    }

    KafkaProducerService(
            KafkaTemplate<String, TelemetryEvent> telemetryKafkaTemplate,
            KafkaTemplate<String, String> dlqKafkaTemplate,
            ObjectMapper objectMapper,
            PulsestreamKafkaProperties kafkaProperties,
            Clock clock,
            CircuitBreaker circuitBreaker,
            Bulkhead bulkhead
    ) {
        this.telemetryKafkaTemplate = telemetryKafkaTemplate;
        this.dlqKafkaTemplate = dlqKafkaTemplate;
        this.objectMapper = objectMapper;
        this.kafkaProperties = kafkaProperties;
        this.clock = clock;
        this.circuitBreaker = circuitBreaker;
        this.bulkhead = bulkhead;
    }

    public void publishTelemetryEvent(TelemetryEvent telemetryEvent) {
        Assert.notNull(telemetryEvent, "telemetryEvent must not be null");

        String rawTopic = kafkaProperties.getTopics().getRaw();
        String messageKey = resolveMessageKey(telemetryEvent);

        // The bulkhead wraps the breaker so a saturated bulkhead rejects the call before
        // the breaker sees it; a rejection is back-pressure, not a broker failure.
        Runnable guardedPublish = Bulkhead.decorateRunnable(
                bulkhead,
                CircuitBreaker.decorateRunnable(
                        circuitBreaker,
                        () -> sendBlocking(telemetryKafkaTemplate, rawTopic, messageKey, telemetryEvent)
                )
        );

        try {
            guardedPublish.run();
        } catch (CallNotPermittedException rejected) {
            // The breaker is open: Kafka has been failing, so fail fast instead of tying up
            // a request thread for the full publish timeout. Nothing was sent, so there is
            // nothing to dead-letter; the client is told when to retry.
            log.warn(
                    "Rejected telemetry event eventId={} key={}: circuit breaker '{}' is {}",
                    telemetryEvent.eventId(),
                    messageKey,
                    circuitBreaker.getName(),
                    circuitBreaker.getState()
            );
            throw new TelemetryPublishingRejectedException(
                    "Kafka publishing is temporarily suspended by the circuit breaker",
                    openStateRetryAfter(),
                    rejected
            );
        } catch (BulkheadFullException rejected) {
            log.warn(
                    "Rejected telemetry event eventId={} key={}: publish bulkhead '{}' is saturated",
                    telemetryEvent.eventId(),
                    messageKey,
                    bulkhead.getName()
            );
            throw new TelemetryPublishingRejectedException(
                    "Kafka publishing capacity is temporarily exhausted",
                    BULKHEAD_RETRY_AFTER,
                    rejected
            );
        } catch (KafkaSendFailure failure) {
            Throwable cause = failure.getCause();
            log.error(
                    "Failed to publish telemetry event to Kafka topic={} key={} eventId={}",
                    rawTopic,
                    messageKey,
                    telemetryEvent.eventId(),
                    cause
            );
            // Preserve the failed event in the DLQ so it is not lost. This is best-effort:
            // if the broker itself is unavailable the DLQ publish will also fail, which we
            // log rather than propagate so the service never crashes on a publish failure.
            routeToDeadLetterQueue(telemetryEvent, messageKey, cause);
            throw new TelemetryPublishingException("Failed to publish telemetry event to Kafka", cause);
        }
    }

    private void routeToDeadLetterQueue(TelemetryEvent telemetryEvent, String messageKey, Throwable cause) {
        String dlqTopic = kafkaProperties.getTopics().getDlq();
        DeadLetterEvent deadLetterEvent = new DeadLetterEvent(
                telemetryEvent,
                describeError(cause),
                SOURCE_SERVICE,
                Instant.now(clock)
        );
        // Render the DLQ value up-front as a String using logic that is independent of the
        // raw-topic JSON path. Even when the raw publish failed because the event could not
        // be serialized, the original payload and failure metadata are still preserved here
        // (falling back to the envelope's text form if needed).
        String dlqValue = renderDeadLetterValue(deadLetterEvent);

        try {
            sendBlocking(dlqKafkaTemplate, dlqTopic, messageKey, dlqValue);
            log.warn(
                    "Rerouted failed telemetry event to DLQ topic={} key={} eventId={} reason={}",
                    dlqTopic,
                    messageKey,
                    telemetryEvent.eventId(),
                    deadLetterEvent.errorMessage()
            );
        } catch (KafkaSendFailure dlqFailure) {
            log.error(
                    "Failed to reroute telemetry event to DLQ topic={} key={} eventId={}; event may be lost",
                    dlqTopic,
                    messageKey,
                    telemetryEvent.eventId(),
                    dlqFailure.getCause()
            );
        }
    }

    /**
     * Produces the string value published to the DLQ. Preferring JSON keeps the DLQ
     * record consistent with the raw topic, but because a raw-topic serialization
     * failure would recur here, any serialization error falls back to the envelope's
     * text representation so the original payload and metadata are never silently dropped.
     */
    private String renderDeadLetterValue(DeadLetterEvent deadLetterEvent) {
        try {
            return objectMapper.writeValueAsString(deadLetterEvent);
        } catch (Exception ex) {
            log.warn(
                    "Falling back to non-JSON DLQ representation for eventId={} due to serialization failure",
                    deadLetterEvent.event().eventId(),
                    ex
            );
            return String.valueOf(deadLetterEvent);
        }
    }

    private String describeError(Throwable cause) {
        if (cause == null) {
            return "Unknown publishing failure";
        }
        return StringUtils.hasText(cause.getMessage())
                ? cause.getClass().getSimpleName() + ": " + cause.getMessage()
                : cause.getClass().getSimpleName();
    }

    private <V> void sendBlocking(
            KafkaTemplate<String, V> template,
            String topic,
            String messageKey,
            V value
    ) {
        long publishTimeoutMillis = publishTimeoutMillis();

        try {
            template.send(topic, messageKey, value)
                    .get(publishTimeoutMillis, TimeUnit.MILLISECONDS);
        } catch (InterruptedException ex) {
            Thread.currentThread().interrupt();
            throw new KafkaSendFailure(ex);
        } catch (ExecutionException ex) {
            throw new KafkaSendFailure(ex.getCause() != null ? ex.getCause() : ex);
        } catch (TimeoutException ex) {
            TimeoutException timeoutException =
                    new TimeoutException("Kafka publish did not complete within " + publishTimeoutMillis + " ms");
            timeoutException.initCause(ex);
            throw new KafkaSendFailure(timeoutException);
        } catch (RuntimeException ex) {
            throw new KafkaSendFailure(ex);
        }
    }

    private String resolveMessageKey(TelemetryEvent telemetryEvent) {
        if (StringUtils.hasText(telemetryEvent.eventId())) {
            return telemetryEvent.eventId().trim();
        }

        Assert.hasText(telemetryEvent.tenantId(),
                "telemetryEvent must contain a non-blank tenantId when eventId is blank");

        return telemetryEvent.tenantId().trim();
    }

    private Duration openStateRetryAfter() {
        long waitMillis = circuitBreaker.getCircuitBreakerConfig()
                .getWaitIntervalFunctionInOpenState()
                .apply(1);
        return Duration.ofMillis(Math.max(waitMillis, 1000L));
    }

    private long publishTimeoutMillis() {
        Duration publishTimeout = kafkaProperties.getProducer().getPublishTimeout();
        Assert.notNull(publishTimeout, "Kafka producer publish timeout must not be null");
        Assert.isTrue(publishTimeout.toMillis() > 0,
                "Kafka producer publish timeout must be greater than zero");
        return publishTimeout.toMillis();
    }

    /**
     * Internal signal that a Kafka send did not complete successfully. It carries the
     * normalized underlying cause so callers can log it, decide whether to reroute the
     * event to the DLQ, and surface a controlled {@link TelemetryPublishingException}.
     */
    private static final class KafkaSendFailure extends RuntimeException {

        private KafkaSendFailure(Throwable cause) {
            super(cause);
        }
    }
}
