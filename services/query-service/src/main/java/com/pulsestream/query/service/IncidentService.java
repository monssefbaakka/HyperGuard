package com.pulsestream.query.service;

import com.pulsestream.query.config.QueryProperties;
import com.pulsestream.query.dto.AnomalyRecordDto;
import com.pulsestream.query.dto.IncidentDtos.IncidentDetailDto;
import com.pulsestream.query.dto.IncidentDtos.IncidentDto;
import com.pulsestream.query.dto.PageResponseDto;
import com.pulsestream.query.exception.ResourceExceptions.NotFoundException;
import com.pulsestream.query.exception.ResourceExceptions.StateConflictException;
import com.pulsestream.query.model.DeviceQuarantineEntity;
import com.pulsestream.query.model.IncidentEntity;
import com.pulsestream.query.model.OperatorEntity;
import com.pulsestream.query.repository.AnomalyRepository;
import com.pulsestream.query.repository.DeviceQuarantineRepository;
import com.pulsestream.query.repository.IncidentRepository;
import com.pulsestream.query.repository.IncidentSpecifications;
import java.time.Clock;
import java.util.Set;
import java.util.stream.Collectors;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Incident triage: listing, the full dossier of one incident, and the operator lifecycle
 * {@code OPEN → ACKNOWLEDGED → RESOLVED}. Every transition records who made it and when.
 */
@Service
public class IncidentService {

    private static final Logger log = LoggerFactory.getLogger(IncidentService.class);

    /** The dossier carries at most this many readings; the incident's own count stays exact. */
    static final int DOSSIER_ANOMALY_LIMIT = 500;

    private final IncidentRepository incidents;
    private final AnomalyRepository anomalies;
    private final DeviceQuarantineRepository quarantine;
    private final QueryProperties properties;
    private final Clock clock;

    @Autowired
    public IncidentService(
            IncidentRepository incidents,
            AnomalyRepository anomalies,
            DeviceQuarantineRepository quarantine,
            QueryProperties properties) {
        this(incidents, anomalies, quarantine, properties, Clock.systemUTC());
    }

    IncidentService(
            IncidentRepository incidents,
            AnomalyRepository anomalies,
            DeviceQuarantineRepository quarantine,
            QueryProperties properties,
            Clock clock) {
        this.incidents = incidents;
        this.anomalies = anomalies;
        this.quarantine = quarantine;
        this.properties = properties;
        this.clock = clock;
    }

    /** Newest activity first. {@code status} also accepts {@code ACTIVE} for "not resolved". */
    @Transactional(readOnly = true)
    public PageResponseDto<IncidentDto> search(
            String tenantId, String deviceId, String status, String severity, int page, int size) {
        PageRequest pageable = PageRequest.of(
                Math.max(page, 0),
                Math.min(Math.max(size, 1), properties.maxPageSize()),
                Sort.by(Sort.Direction.DESC, "lastAnomalyAt"));
        Page<IncidentEntity> result = incidents.findAll(
                IncidentSpecifications.matchesAll(tenantId, deviceId, status, severity), pageable);
        Set<DeviceQuarantineEntity.Key> quarantined = quarantinedKeys(tenantId);
        return PageResponseDto.from(result, incident -> IncidentDto.from(incident, isQuarantined(quarantined, incident)));
    }

    @Transactional(readOnly = true)
    public IncidentDetailDto get(long id) {
        IncidentEntity incident = find(id);
        return new IncidentDetailDto(
                toDto(incident),
                anomalies.findByIncidentIdOrderByTimestampAsc(id, PageRequest.of(0, DOSSIER_ANOMALY_LIMIT)).stream()
                        .map(AnomalyRecordDto::from)
                        .toList(),
                DOSSIER_ANOMALY_LIMIT);
    }

    @Transactional
    public IncidentDto acknowledge(long id, OperatorEntity operator) {
        IncidentEntity incident = find(id);
        try {
            incident.acknowledge(operator.getUsername(), clock.instant());
        } catch (IllegalStateException refused) {
            throw new StateConflictException(refused.getMessage());
        }
        log.info("Incident id={} acknowledged by '{}'", id, operator.getUsername());
        return toDto(incidents.saveAndFlush(incident));
    }

    @Transactional
    public IncidentDto resolve(long id, String note, OperatorEntity operator) {
        IncidentEntity incident = find(id);
        try {
            incident.resolve(operator.getUsername(), note.trim(), clock.instant());
        } catch (IllegalStateException refused) {
            throw new StateConflictException(refused.getMessage());
        }
        log.info("Incident id={} resolved by '{}'", id, operator.getUsername());
        return toDto(incidents.saveAndFlush(incident));
    }

    private IncidentEntity find(long id) {
        return incidents.findById(id).orElseThrow(() -> new NotFoundException("Incident " + id + " does not exist."));
    }

    private IncidentDto toDto(IncidentEntity incident) {
        boolean quarantined = quarantine.existsById(new DeviceQuarantineEntity.Key(incident.getTenantId(), incident.getDeviceId()));
        return IncidentDto.from(incident, quarantined);
    }

    private Set<DeviceQuarantineEntity.Key> quarantinedKeys(String tenantId) {
        return quarantine.findByTenant(tenantId == null || tenantId.isBlank() ? null : tenantId).stream()
                .map(DeviceQuarantineEntity::getKey)
                .collect(Collectors.toSet());
    }

    private static boolean isQuarantined(Set<DeviceQuarantineEntity.Key> keys, IncidentEntity incident) {
        return keys.contains(new DeviceQuarantineEntity.Key(incident.getTenantId(), incident.getDeviceId()));
    }
}
