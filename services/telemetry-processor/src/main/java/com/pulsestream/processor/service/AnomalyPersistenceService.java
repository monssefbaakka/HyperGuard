package com.pulsestream.processor.service;

import com.pulsestream.processor.model.NormalizedTelemetryEvent;
import com.pulsestream.processor.model.TelemetryAnomalyResult;
import com.pulsestream.processor.service.IncidentCorrelationService.FlaggedReading;
import java.time.Clock;
import java.time.Instant;
import java.util.Optional;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.dao.OptimisticLockingFailureException;
import org.springframework.stereotype.Service;
import org.springframework.util.Assert;
import org.springframework.util.StringUtils;

/**
 * Writes flagged readings to {@code platform.anomalies} and correlates them into incidents.
 *
 * <p>A reading that is missing its tenant, device, metric or value cannot be stored against a device
 * and is only published. Two replicas racing on the same device (a duplicate event id or a second
 * active incident) surface as an integrity or version conflict; the correlation is retried once,
 * which then sees the winner's row and either joins it or skips the duplicate.
 */
@Service
public class AnomalyPersistenceService {

    private static final Logger log = LoggerFactory.getLogger(AnomalyPersistenceService.class);
    private static final int MAX_REASONS_LENGTH = 1000;

    private final IncidentCorrelationService correlationService;
    private final Clock clock;

    @Autowired
    public AnomalyPersistenceService(IncidentCorrelationService correlationService) {
        this(correlationService, Clock.systemUTC());
    }

    AnomalyPersistenceService(IncidentCorrelationService correlationService, Clock clock) {
        this.correlationService = correlationService;
        this.clock = clock;
    }

    /** @return the incident the reading joined, or empty when it was not stored */
    public Optional<Long> persist(TelemetryAnomalyResult result) {
        Assert.notNull(result, "anomaly result must not be null");
        Assert.isTrue(result.anomalous(), "anomaly result must be anomalous");

        NormalizedTelemetryEvent event = result.event();
        if (!StringUtils.hasText(event.eventId()) || !StringUtils.hasText(event.tenantId())
                || !StringUtils.hasText(event.deviceId()) || !StringUtils.hasText(event.metric())
                || event.value() == null || result.threshold() == null) {
            log.info("Anomaly eventId={} lacks the fields needed to store it against a device; published only", event.eventId());
            return Optional.empty();
        }

        FlaggedReading reading = new FlaggedReading(
                event.eventId(),
                event.tenantId(),
                event.deviceId(),
                event.metric(),
                event.value(),
                result.threshold(),
                result.anomalyType(),
                result.severity(),
                truncate(String.join("; ", result.reasons())),
                event.timestamp() != null ? event.timestamp() : Instant.now(clock));

        try {
            return correlationService.record(reading);
        } catch (DataIntegrityViolationException | OptimisticLockingFailureException conflict) {
            log.info("Concurrent correlation for device={} eventId={}; retrying once", reading.deviceId(), reading.eventId());
            return correlationService.record(reading);
        }
    }

    private static String truncate(String reasons) {
        return reasons.length() <= MAX_REASONS_LENGTH ? reasons : reasons.substring(0, MAX_REASONS_LENGTH);
    }
}
