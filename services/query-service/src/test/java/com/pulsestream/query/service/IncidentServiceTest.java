package com.pulsestream.query.service;

import com.pulsestream.query.config.QueryProperties;
import com.pulsestream.query.dto.IncidentDtos.IncidentDetailDto;
import com.pulsestream.query.dto.IncidentDtos.IncidentDto;
import com.pulsestream.query.dto.PageResponseDto;
import com.pulsestream.query.exception.ResourceExceptions.NotFoundException;
import com.pulsestream.query.exception.ResourceExceptions.StateConflictException;
import com.pulsestream.query.model.DeviceQuarantineEntity;
import com.pulsestream.query.model.OperatorEntity;
import com.pulsestream.query.repository.AnomalyRepository;
import com.pulsestream.query.repository.DeviceQuarantineRepository;
import com.pulsestream.query.repository.IncidentRepository;
import jakarta.persistence.EntityManager;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.List;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.jdbc.AutoConfigureTestDatabase;
import org.springframework.boot.test.autoconfigure.orm.jpa.DataJpaTest;
import org.springframework.test.context.ActiveProfiles;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

@ActiveProfiles("test")
@DataJpaTest
@AutoConfigureTestDatabase(replace = AutoConfigureTestDatabase.Replace.NONE)
class IncidentServiceTest {

    private static final Instant T0 = Instant.parse("2026-09-15T10:00:00Z");
    private static final Instant NOW = Instant.parse("2026-09-15T12:00:00Z");

    @Autowired
    private EntityManager entityManager;

    @Autowired
    private IncidentRepository incidents;

    @Autowired
    private AnomalyRepository anomalies;

    @Autowired
    private DeviceQuarantineRepository quarantine;

    private IncidentService service;
    private final OperatorEntity operator = new OperatorEntity("monssef", "hash", "Monssef", null, T0);

    @BeforeEach
    void seed() {
        service = new IncidentService(
                incidents, anomalies, quarantine, new QueryProperties(100, 100, List.of()), Clock.fixed(NOW, ZoneOffset.UTC));
        insertIncident(1L, "device-1", "OPEN", "CRITICAL", T0.plusSeconds(600));
        insertIncident(2L, "device-2", "RESOLVED", "WARNING", T0);
        QueryServiceTestData.insertAnomaly(entityManager, 10L, "evt-1", "tenant-a", "device-1", "temperature", "84.0", "WARNING", T0);
        QueryServiceTestData.insertAnomaly(entityManager, 11L, "evt-2", "tenant-a", "device-1", "temperature", "96.0", "CRITICAL", T0.plusSeconds(600));
        entityManager.createNativeQuery("update platform.anomalies set incident_id = 1").executeUpdate();
        quarantine.saveAndFlush(new DeviceQuarantineEntity("tenant-a", "device-1", "overheating", 1L, "monssef", T0));
        entityManager.clear();
    }

    @Test
    void activeFilterReturnsUnresolvedIncidentsWithTheirQuarantineState() {
        PageResponseDto<IncidentDto> page = service.search(null, null, "active", null, 0, 50);

        assertThat(page.content()).singleElement().satisfies(incident -> {
            assertThat(incident.id()).isEqualTo(1L);
            assertThat(incident.metrics()).containsExactly("temperature", "vibration");
            assertThat(incident.quarantined()).isTrue();
        });
    }

    @Test
    void dossierListsTheCorrelatedReadingsOldestFirst() {
        IncidentDetailDto detail = service.get(1L);

        assertThat(detail.anomalies()).extracting("eventId").containsExactly("evt-1", "evt-2");
        assertThat(detail.incident().anomalyCount()).isEqualTo(2);
    }

    @Test
    void acknowledgeThenResolveRecordsWhoActedAndWhen() {
        IncidentDto acknowledged = service.acknowledge(1L, operator);
        assertThat(acknowledged.status()).isEqualTo("ACKNOWLEDGED");
        assertThat(acknowledged.acknowledgedBy()).isEqualTo("monssef");
        assertThat(acknowledged.acknowledgedAt()).isEqualTo(NOW);

        IncidentDto resolved = service.resolve(1L, "  Replaced the fan  ", operator);
        assertThat(resolved.status()).isEqualTo("RESOLVED");
        assertThat(resolved.resolvedBy()).isEqualTo("monssef");
        assertThat(resolved.resolutionNote()).isEqualTo("Replaced the fan");
    }

    @Test
    void invalidTransitionsAreConflicts() {
        service.acknowledge(1L, operator);

        assertThatThrownBy(() -> service.acknowledge(1L, operator))
                .isInstanceOf(StateConflictException.class)
                .hasMessageContaining("already acknowledged by monssef");
        assertThatThrownBy(() -> service.resolve(2L, "again", operator))
                .isInstanceOf(StateConflictException.class);
    }

    @Test
    void unknownIncidentIsNotFound() {
        assertThatThrownBy(() -> service.get(99L)).isInstanceOf(NotFoundException.class);
    }

    private void insertIncident(long id, String deviceId, String status, String severity, Instant last) {
        entityManager.createNativeQuery("""
                        insert into platform.incidents
                            (id, tenant_id, device_id, status, severity, anomaly_count, metrics, peak_value,
                             peak_threshold, opened_at, last_anomaly_at, version)
                        values (?, 'tenant-a', ?, ?, ?, 2, 'temperature,vibration', 96.0, 80.0, ?, ?, 0)
                        """)
                .setParameter(1, id)
                .setParameter(2, deviceId)
                .setParameter(3, status)
                .setParameter(4, severity)
                .setParameter(5, T0)
                .setParameter(6, last)
                .executeUpdate();
    }
}
