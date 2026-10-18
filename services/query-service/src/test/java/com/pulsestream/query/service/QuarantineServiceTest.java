package com.pulsestream.query.service;

import com.pulsestream.query.dto.IncidentDtos.QuarantineDto;
import com.pulsestream.query.exception.ResourceExceptions.NotFoundException;
import com.pulsestream.query.exception.ResourceExceptions.StateConflictException;
import com.pulsestream.query.model.OperatorEntity;
import com.pulsestream.query.repository.DeviceQuarantineRepository;
import com.pulsestream.query.repository.IncidentRepository;
import com.pulsestream.query.repository.ProcessedTelemetryRepository;
import jakarta.persistence.EntityManager;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
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
class QuarantineServiceTest {

    private static final Instant NOW = Instant.parse("2026-09-15T12:00:00Z");

    @Autowired
    private EntityManager entityManager;

    @Autowired
    private DeviceQuarantineRepository quarantine;

    @Autowired
    private ProcessedTelemetryRepository telemetry;

    @Autowired
    private IncidentRepository incidents;

    private QuarantineService service;
    private final OperatorEntity operator = new OperatorEntity("monssef", "hash", "Monssef", null, NOW);

    @BeforeEach
    void seed() {
        service = new QuarantineService(quarantine, telemetry, incidents, Clock.fixed(NOW, ZoneOffset.UTC));
        QueryServiceTestData.insertTelemetry(entityManager, 1L, "evt-1", "tenant-a", "device-1", "temperature", "20.0", NOW);
        QueryServiceTestData.insertTelemetry(entityManager, 2L, "evt-2", "tenant-a", "shared", "temperature", "20.0", NOW);
        QueryServiceTestData.insertTelemetry(entityManager, 3L, "evt-3", "tenant-b", "shared", "temperature", "20.0", NOW);
    }

    @Test
    void quarantineTakesTheTenantFromTheDevicesReadings() {
        QuarantineDto created = service.quarantine(null, "device-1", "  overheating  ", null, operator);

        assertThat(created.tenantId()).isEqualTo("tenant-a");
        assertThat(created.reason()).isEqualTo("overheating");
        assertThat(created.quarantinedBy()).isEqualTo("monssef");
        assertThat(created.quarantinedAt()).isEqualTo(NOW);
        assertThat(service.list(null)).extracting(QuarantineDto::deviceId).containsExactly("device-1");
    }

    @Test
    void quarantiningTwiceIsAConflict() {
        service.quarantine(null, "device-1", "overheating", null, operator);

        assertThatThrownBy(() -> service.quarantine("tenant-a", "device-1", "again", null, operator))
                .isInstanceOf(StateConflictException.class);
    }

    @Test
    void aDeviceThatNeverReportedCannotBeQuarantined() {
        assertThatThrownBy(() -> service.quarantine(null, "ghost", "why", null, operator))
                .isInstanceOf(NotFoundException.class);
    }

    @Test
    void anAmbiguousDeviceIdNeedsATenant() {
        assertThatThrownBy(() -> service.quarantine(null, "shared", "why", null, operator))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("pass tenantId");

        assertThat(service.quarantine("tenant-b", "shared", "why", null, operator).tenantId()).isEqualTo("tenant-b");
    }

    @Test
    void releaseRemovesTheEntry() {
        service.quarantine(null, "device-1", "overheating", null, operator);

        QuarantineDto released = service.release(null, "device-1", operator);

        assertThat(released.deviceId()).isEqualTo("device-1");
        assertThat(service.list(null)).isEmpty();
        assertThatThrownBy(() -> service.release(null, "device-1", operator)).isInstanceOf(NotFoundException.class);
    }
}
