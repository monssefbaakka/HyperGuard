package com.pulsestream.processor.service;

import com.pulsestream.processor.config.IncidentProperties;
import com.pulsestream.processor.model.AnomalyRecordEntity;
import com.pulsestream.processor.model.AnomalySeverity;
import com.pulsestream.processor.model.IncidentEntity;
import com.pulsestream.processor.repository.AnomalyRecordRepository;
import com.pulsestream.processor.repository.IncidentRepository;
import java.math.BigDecimal;
import java.time.Clock;
import java.time.Instant;
import java.util.Optional;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Stores one flagged reading and folds it into its device's incident, in a single transaction.
 *
 * <p>The rule is deliberately plain and explainable: an anomaly joins the device's active incident if
 * that incident's previous anomaly is no older than the correlation window; otherwise the idle
 * incident is closed and a new one is opened. The partial unique index on {@code platform.incidents}
 * guarantees one active incident per device even with several processor replicas — a replica that
 * loses that race fails the transaction and the caller retries it.
 */
@Service
public class IncidentCorrelationService {

    private static final Logger log = LoggerFactory.getLogger(IncidentCorrelationService.class);

    private final IncidentRepository incidents;
    private final AnomalyRecordRepository anomalies;
    private final IncidentProperties properties;
    private final Clock clock;

    @Autowired
    public IncidentCorrelationService(
            IncidentRepository incidents, AnomalyRecordRepository anomalies, IncidentProperties properties) {
        this(incidents, anomalies, properties, Clock.systemUTC());
    }

    IncidentCorrelationService(
            IncidentRepository incidents, AnomalyRecordRepository anomalies, IncidentProperties properties, Clock clock) {
        this.incidents = incidents;
        this.anomalies = anomalies;
        this.properties = properties;
        this.clock = clock;
    }

    /** Values of one flagged reading, already validated as complete by the caller. */
    public record FlaggedReading(
            String eventId,
            String tenantId,
            String deviceId,
            String metric,
            BigDecimal value,
            BigDecimal threshold,
            String anomalyType,
            AnomalySeverity severity,
            String reasons,
            Instant timestamp
    ) {
    }

    /**
     * @return the id of the incident the reading was attached to, or empty when this event id is
     * already stored (at-least-once redelivery or a replay)
     */
    @Transactional
    public Optional<Long> record(FlaggedReading reading) {
        if (anomalies.existsByEventId(reading.eventId())) {
            log.debug("Anomaly eventId={} already stored; skipping correlation", reading.eventId());
            return Optional.empty();
        }

        IncidentEntity incident = incidents.findActive(reading.tenantId(), reading.deviceId())
                .flatMap(active -> {
                    boolean idle = active.getLastAnomalyAt()
                            .plus(properties.correlationWindow())
                            .isBefore(reading.timestamp());
                    if (!idle) {
                        return Optional.of(active);
                    }
                    active.autoResolve(clock.instant());
                    // Flush the close before inserting the next incident, or the unique index sees two active rows.
                    incidents.saveAndFlush(active);
                    log.info("Auto-resolved idle incident id={} device={}", active.getId(), active.getDeviceId());
                    return Optional.empty();
                })
                .map(active -> {
                    active.absorb(reading.severity(), reading.metric(), reading.value(), reading.threshold(), reading.timestamp());
                    return incidents.save(active);
                })
                .orElseGet(() -> {
                    IncidentEntity opened = incidents.saveAndFlush(new IncidentEntity(
                            reading.tenantId(),
                            reading.deviceId(),
                            reading.severity(),
                            reading.metric(),
                            reading.value(),
                            reading.threshold(),
                            reading.timestamp()));
                    log.info("Opened incident id={} tenant={} device={}", opened.getId(), reading.tenantId(), reading.deviceId());
                    return opened;
                });

        anomalies.save(new AnomalyRecordEntity(
                reading.eventId(),
                reading.tenantId(),
                reading.timestamp(),
                reading.deviceId(),
                reading.metric(),
                reading.value(),
                reading.threshold(),
                reading.anomalyType(),
                reading.severity().name(),
                reading.reasons(),
                incident.getId(),
                clock.instant()));
        return Optional.of(incident.getId());
    }
}
