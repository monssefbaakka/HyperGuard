package com.pulsestream.processor.consumer;

import com.pulsestream.processor.model.NormalizedTelemetryEvent;
import com.pulsestream.processor.model.TelemetryAnomalyResult;
import com.pulsestream.processor.model.TelemetryEvent;
import com.pulsestream.processor.service.AnomalyPersistenceService;
import com.pulsestream.processor.service.AnomalyProcessingService;
import com.pulsestream.processor.service.DeadLetterPublisher;
import com.pulsestream.processor.service.QuarantineRegistry;
import com.pulsestream.processor.service.ReplayHeaders;
import com.pulsestream.processor.service.TelemetryAnomalyDetectionService;
import com.pulsestream.processor.service.TelemetryNormalizationService;
import com.pulsestream.processor.service.TelemetryProcessingService;
import org.apache.kafka.clients.consumer.ConsumerRecord;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.kafka.annotation.KafkaListener;
import org.springframework.stereotype.Service;
import org.springframework.util.Assert;

@Service
public class TelemetryEventConsumer {

    private static final Logger log = LoggerFactory.getLogger(TelemetryEventConsumer.class);

    private final TelemetryNormalizationService normalizationService;
    private final TelemetryAnomalyDetectionService anomalyDetectionService;
    private final AnomalyProcessingService anomalyProcessingService;
    private final TelemetryProcessingService processingService;
    private final DeadLetterPublisher deadLetterPublisher;
    private final AnomalyPersistenceService anomalyPersistenceService;
    private final QuarantineRegistry quarantineRegistry;

    public TelemetryEventConsumer(
            TelemetryNormalizationService normalizationService,
            TelemetryAnomalyDetectionService anomalyDetectionService,
            AnomalyProcessingService anomalyProcessingService,
            TelemetryProcessingService processingService,
            DeadLetterPublisher deadLetterPublisher,
            AnomalyPersistenceService anomalyPersistenceService,
            QuarantineRegistry quarantineRegistry
    ) {
        this.normalizationService = normalizationService;
        this.anomalyDetectionService = anomalyDetectionService;
        this.anomalyProcessingService = anomalyProcessingService;
        this.processingService = processingService;
        this.deadLetterPublisher = deadLetterPublisher;
        this.anomalyPersistenceService = anomalyPersistenceService;
        this.quarantineRegistry = quarantineRegistry;
    }

    @KafkaListener(
            topics = "${pulsestream.kafka.topics.raw}",
            groupId = "${pulsestream.kafka.consumer.group-id}",
            containerFactory = "telemetryKafkaListenerContainerFactory"
    )
    public void consumeTelemetryRecord(ConsumerRecord<String, TelemetryEvent> record) {
        Assert.notNull(record, "record must not be null");
        consumeTelemetryEvent(record.value(), ReplayHeaders.isReplay(record.headers()));
    }

    void consumeTelemetryEvent(TelemetryEvent telemetryEvent) {
        consumeTelemetryEvent(telemetryEvent, false);
    }

    private void consumeTelemetryEvent(TelemetryEvent telemetryEvent, boolean replayed) {
        Assert.notNull(telemetryEvent, "telemetryEvent must not be null");

        try {
            processTelemetryEvent(telemetryEvent, replayed);
        } catch (RuntimeException ex) {
            if (replayed) {
                log.error(
                        "Failed to process replayed telemetry event eventId={} tenantId={}; "
                                + "leaving the original DLQ record as the retry source to prevent a replay loop",
                        telemetryEvent.eventId(),
                        telemetryEvent.tenantId(),
                        ex
                );
                return;
            }
            log.error(
                    "Failed to process telemetry event eventId={} tenantId={}; routing to DLQ",
                    telemetryEvent.eventId(),
                    telemetryEvent.tenantId(),
                    ex
            );
            deadLetterPublisher.publish(telemetryEvent, ex);
        }
    }

    private void processTelemetryEvent(TelemetryEvent telemetryEvent, boolean replayed) {
        NormalizedTelemetryEvent normalizedEvent =
                normalizationService.normalize(telemetryEvent);

        // A quarantined device's readings are dropped before detection: no storage, no alert, no incident.
        if (quarantineRegistry.isQuarantined(normalizedEvent.tenantId(), normalizedEvent.deviceId())) {
            quarantineRegistry.recordSuppressed(normalizedEvent.tenantId(), normalizedEvent.deviceId());
            log.debug(
                    "Dropped reading from quarantined device eventId={} tenantId={} deviceId={}",
                    normalizedEvent.eventId(),
                    normalizedEvent.tenantId(),
                    normalizedEvent.deviceId()
            );
            return;
        }

        TelemetryAnomalyResult anomalyResult =
                anomalyDetectionService.detect(normalizedEvent);

        if (anomalyResult.anomalous()) {
            log.warn(
                    "Detected telemetry anomaly eventId={} tenantId={} metric={} unit={} value={} severity={} reasons={}",
                    normalizedEvent.eventId(),
                    normalizedEvent.tenantId(),
                    normalizedEvent.metric(),
                    normalizedEvent.unit(),
                    normalizedEvent.value(),
                    anomalyResult.severity(),
                    anomalyResult.reasons()
            );
            // Stored first so the record is acknowledged only once the anomaly and its incident are durable.
            anomalyPersistenceService.persist(anomalyResult);
            anomalyProcessingService.process(telemetryEvent, anomalyResult);
            return;
        }

        if (replayed) {
            processingService.process(telemetryEvent, true);
        } else {
            processingService.process(telemetryEvent);
        }

        log.info(
                "Processed normal telemetry event eventId={} tenantId={} metric={} unit={}",
                normalizedEvent.eventId(),
                normalizedEvent.tenantId(),
                normalizedEvent.metric(),
                normalizedEvent.unit()
        );
    }
}
