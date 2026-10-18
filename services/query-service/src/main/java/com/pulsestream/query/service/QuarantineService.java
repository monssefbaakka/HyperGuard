package com.pulsestream.query.service;

import com.pulsestream.query.dto.IncidentDtos.QuarantineDto;
import com.pulsestream.query.exception.ResourceExceptions.NotFoundException;
import com.pulsestream.query.exception.ResourceExceptions.StateConflictException;
import com.pulsestream.query.model.DeviceQuarantineEntity;
import com.pulsestream.query.model.OperatorEntity;
import com.pulsestream.query.repository.DeviceQuarantineRepository;
import com.pulsestream.query.repository.IncidentRepository;
import com.pulsestream.query.repository.ProcessedTelemetryRepository;
import java.time.Clock;
import java.util.List;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

/**
 * Quarantines and releases devices. The effect is applied by telemetry-processor, which drops a
 * quarantined device's readings within its refresh interval (a few seconds by default).
 *
 * <p>Device ids are only unique within a tenant. When the caller names no tenant, the tenant is
 * taken from the readings the device has sent; a device id reported under several tenants needs an
 * explicit {@code tenantId}.
 */
@Service
public class QuarantineService {

    private static final Logger log = LoggerFactory.getLogger(QuarantineService.class);

    private final DeviceQuarantineRepository quarantine;
    private final ProcessedTelemetryRepository telemetry;
    private final IncidentRepository incidents;
    private final Clock clock;

    @Autowired
    public QuarantineService(
            DeviceQuarantineRepository quarantine, ProcessedTelemetryRepository telemetry, IncidentRepository incidents) {
        this(quarantine, telemetry, incidents, Clock.systemUTC());
    }

    QuarantineService(
            DeviceQuarantineRepository quarantine,
            ProcessedTelemetryRepository telemetry,
            IncidentRepository incidents,
            Clock clock) {
        this.quarantine = quarantine;
        this.telemetry = telemetry;
        this.incidents = incidents;
        this.clock = clock;
    }

    @Transactional(readOnly = true)
    public List<QuarantineDto> list(String tenantId) {
        return quarantine.findByTenant(StringUtils.hasText(tenantId) ? tenantId : null).stream()
                .map(QuarantineDto::from)
                .toList();
    }

    @Transactional
    public QuarantineDto quarantine(String tenantId, String deviceId, String reason, Long incidentId, OperatorEntity operator) {
        String tenant = resolveTenant(tenantId, deviceId);
        DeviceQuarantineEntity.Key key = new DeviceQuarantineEntity.Key(tenant, deviceId);
        if (quarantine.existsById(key)) {
            throw new StateConflictException("Device " + deviceId + " is already quarantined.");
        }
        if (incidentId != null && !incidents.existsById(incidentId)) {
            throw new NotFoundException("Incident " + incidentId + " does not exist.");
        }
        DeviceQuarantineEntity saved = quarantine.saveAndFlush(new DeviceQuarantineEntity(
                tenant, deviceId, reason.trim(), incidentId, operator.getUsername(), clock.instant()));
        log.warn("Device tenant={} device={} quarantined by '{}': {}", tenant, deviceId, operator.getUsername(), reason);
        return QuarantineDto.from(saved);
    }

    /** @return the released entry, with the number of readings dropped while it was in place */
    @Transactional
    public QuarantineDto release(String tenantId, String deviceId, OperatorEntity operator) {
        DeviceQuarantineEntity entry = findEntry(tenantId, deviceId);
        quarantine.delete(entry);
        log.warn("Device tenant={} device={} released by '{}' after {} suppressed readings",
                entry.getKey().tenantId(), deviceId, operator.getUsername(), entry.getSuppressedEvents());
        return QuarantineDto.from(entry);
    }

    private DeviceQuarantineEntity findEntry(String tenantId, String deviceId) {
        if (StringUtils.hasText(tenantId)) {
            return quarantine.findById(new DeviceQuarantineEntity.Key(tenantId, deviceId))
                    .orElseThrow(() -> new NotFoundException("Device " + deviceId + " is not quarantined."));
        }
        List<DeviceQuarantineEntity> matches = quarantine.findByTenant(null).stream()
                .filter(entry -> entry.getKey().deviceId().equals(deviceId))
                .toList();
        if (matches.isEmpty()) {
            throw new NotFoundException("Device " + deviceId + " is not quarantined.");
        }
        if (matches.size() > 1) {
            throw new IllegalArgumentException("Device " + deviceId + " is quarantined under several tenants; pass tenantId.");
        }
        return matches.get(0);
    }

    private String resolveTenant(String tenantId, String deviceId) {
        List<String> tenants = telemetry.findTenantsReportingDevice(deviceId);
        if (StringUtils.hasText(tenantId)) {
            if (!tenants.contains(tenantId)) {
                throw new NotFoundException("Device " + deviceId + " has sent no readings for tenant " + tenantId + ".");
            }
            return tenantId;
        }
        if (tenants.isEmpty()) {
            throw new NotFoundException("Device " + deviceId + " has sent no readings.");
        }
        if (tenants.size() > 1) {
            throw new IllegalArgumentException("Device " + deviceId + " reports under several tenants; pass tenantId.");
        }
        return tenants.get(0);
    }
}
