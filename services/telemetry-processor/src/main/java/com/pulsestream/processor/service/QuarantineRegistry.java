package com.pulsestream.processor.service;

import com.pulsestream.processor.config.IncidentProperties;
import com.pulsestream.processor.model.DeviceQuarantineEntity;
import com.pulsestream.processor.repository.DeviceQuarantineRepository;
import io.micrometer.core.instrument.Counter;
import io.micrometer.core.instrument.MeterRegistry;
import java.time.Clock;
import java.time.Instant;
import java.util.Set;
import java.util.stream.Collectors;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.dao.DataAccessException;
import org.springframework.stereotype.Service;

/**
 * Answers "is this device quarantined?" for every consumed reading without a database round trip per
 * event: the quarantined set is cached and re-read once it is older than
 * {@code pulsestream.incidents.quarantine-refresh}.
 *
 * <p>If the table cannot be read, the last known set is kept — a database hiccup must neither release
 * every quarantined device nor stop the pipeline.
 */
@Service
public class QuarantineRegistry {

    private static final Logger log = LoggerFactory.getLogger(QuarantineRegistry.class);

    private final DeviceQuarantineRepository repository;
    private final IncidentProperties properties;
    private final Clock clock;
    private final Counter suppressedCounter;

    private volatile Set<DeviceQuarantineEntity.Key> quarantined = Set.of();
    private volatile Instant loadedAt = Instant.EPOCH;

    @Autowired
    public QuarantineRegistry(DeviceQuarantineRepository repository, IncidentProperties properties, MeterRegistry meterRegistry) {
        this(repository, properties, meterRegistry, Clock.systemUTC());
    }

    QuarantineRegistry(
            DeviceQuarantineRepository repository, IncidentProperties properties, MeterRegistry meterRegistry, Clock clock) {
        this.repository = repository;
        this.properties = properties;
        this.clock = clock;
        this.suppressedCounter = Counter.builder("pulsestream.quarantine.suppressed.events")
                .description("Readings dropped because their device is quarantined")
                .register(meterRegistry);
    }

    public boolean isQuarantined(String tenantId, String deviceId) {
        if (tenantId == null || deviceId == null) {
            return false;
        }
        refreshIfStale();
        return quarantined.contains(new DeviceQuarantineEntity.Key(tenantId, deviceId));
    }

    /** Counts one dropped reading, both as a metric and on the device's quarantine row. */
    public void recordSuppressed(String tenantId, String deviceId) {
        suppressedCounter.increment();
        try {
            repository.addSuppressed(tenantId, deviceId, 1);
        } catch (DataAccessException ex) {
            log.warn("Could not count suppressed reading for quarantined device={}", deviceId, ex);
        }
    }

    private void refreshIfStale() {
        Instant now = clock.instant();
        if (loadedAt.plus(properties.quarantineRefresh()).isAfter(now)) {
            return;
        }
        synchronized (this) {
            if (loadedAt.plus(properties.quarantineRefresh()).isAfter(now)) {
                return;
            }
            try {
                quarantined = repository.findAll().stream()
                        .map(DeviceQuarantineEntity::getKey)
                        .collect(Collectors.toUnmodifiableSet());
            } catch (DataAccessException ex) {
                log.warn("Could not refresh quarantined devices; keeping the last known {} entries", quarantined.size(), ex);
            }
            loadedAt = now;
        }
    }
}
