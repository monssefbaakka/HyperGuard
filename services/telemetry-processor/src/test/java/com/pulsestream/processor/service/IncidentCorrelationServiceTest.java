package com.pulsestream.processor.service;

import com.pulsestream.processor.config.IncidentProperties;
import com.pulsestream.processor.model.AnomalyRecordEntity;
import com.pulsestream.processor.model.AnomalySeverity;
import com.pulsestream.processor.model.IncidentEntity;
import com.pulsestream.processor.repository.AnomalyRecordRepository;
import com.pulsestream.processor.repository.IncidentRepository;
import com.pulsestream.processor.service.IncidentCorrelationService.FlaggedReading;
import java.math.BigDecimal;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.Optional;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.jdbc.AutoConfigureTestDatabase;
import org.springframework.boot.test.autoconfigure.orm.jpa.DataJpaTest;

import static org.assertj.core.api.Assertions.assertThat;

@DataJpaTest(properties = {
        "spring.datasource.url=jdbc:h2:mem:incident-correlation;MODE=PostgreSQL;DATABASE_TO_LOWER=TRUE;NON_KEYWORDS=VALUE;INIT=CREATE SCHEMA IF NOT EXISTS platform",
        "spring.datasource.driver-class-name=org.h2.Driver",
        "spring.jpa.database-platform=org.hibernate.dialect.H2Dialect",
        "spring.jpa.hibernate.ddl-auto=create-drop",
        "spring.jpa.properties.hibernate.default_schema=platform"
})
@AutoConfigureTestDatabase(replace = AutoConfigureTestDatabase.Replace.NONE)
class IncidentCorrelationServiceTest {

    private static final Instant T0 = Instant.parse("2026-09-15T10:00:00Z");

    @Autowired
    private IncidentRepository incidents;

    @Autowired
    private AnomalyRecordRepository anomalies;

    private IncidentCorrelationService service;

    @BeforeEach
    void setUp() {
        service = new IncidentCorrelationService(
                incidents,
                anomalies,
                new IncidentProperties(Duration.ofMinutes(15), Duration.ofSeconds(5)),
                Clock.fixed(T0.plus(Duration.ofHours(1)), ZoneOffset.UTC));
    }

    @Test
    void firstAnomalyOpensAnIncidentAndLinksTheReading() {
        Optional<Long> incidentId = service.record(reading("evt-1", "temperature", "84", "80", AnomalySeverity.WARNING, T0));

        assertThat(incidentId).isPresent();
        IncidentEntity incident = incidents.findById(incidentId.get()).orElseThrow();
        assertThat(incident.getStatus()).isEqualTo(IncidentEntity.OPEN);
        assertThat(incident.getAnomalyCount()).isEqualTo(1);
        assertThat(incident.getSeverity()).isEqualTo("WARNING");
        assertThat(anomalies.findAll()).singleElement()
                .extracting(AnomalyRecordEntity::getIncidentId).isEqualTo(incidentId.get());
    }

    @Test
    void anomaliesWithinTheWindowJoinTheSameIncident() {
        Long first = service.record(reading("evt-1", "temperature", "84", "80", AnomalySeverity.WARNING, T0)).orElseThrow();
        Long second = service.record(reading("evt-2", "pressure", "30", "150", AnomalySeverity.CRITICAL, T0.plus(Duration.ofMinutes(10))))
                .orElseThrow();

        assertThat(second).isEqualTo(first);
        IncidentEntity incident = incidents.findById(first).orElseThrow();
        assertThat(incident.getAnomalyCount()).isEqualTo(2);
        assertThat(incident.getSeverity()).isEqualTo("CRITICAL");
        assertThat(incident.getMetrics()).isEqualTo("temperature,pressure");
        // |30 - 150| / 150 = 0.8 beats |84 - 80| / 80 = 0.05
        assertThat(incident.getPeakValue()).isEqualByComparingTo("30");
        assertThat(incident.getLastAnomalyAt()).isEqualTo(T0.plus(Duration.ofMinutes(10)));
    }

    @Test
    void anAnomalyAfterTheWindowClosesTheIdleIncidentAndOpensANewOne() {
        Long first = service.record(reading("evt-1", "temperature", "84", "80", AnomalySeverity.WARNING, T0)).orElseThrow();
        Long second = service.record(reading("evt-2", "temperature", "90", "80", AnomalySeverity.WARNING, T0.plus(Duration.ofMinutes(20))))
                .orElseThrow();

        assertThat(second).isNotEqualTo(first);
        IncidentEntity closed = incidents.findById(first).orElseThrow();
        assertThat(closed.getStatus()).isEqualTo(IncidentEntity.RESOLVED);
        assertThat(closed.getResolvedBy()).isEqualTo(IncidentEntity.AUTO_RESOLVER);
        assertThat(incidents.findActive("tenant-a", "sensor-1")).map(IncidentEntity::getId).contains(second);
    }

    @Test
    void aRedeliveredEventIsNotCountedTwice() {
        service.record(reading("evt-1", "temperature", "84", "80", AnomalySeverity.WARNING, T0));

        assertThat(service.record(reading("evt-1", "temperature", "84", "80", AnomalySeverity.WARNING, T0))).isEmpty();
        assertThat(incidents.findAll()).singleElement().extracting(IncidentEntity::getAnomalyCount).isEqualTo(1);
    }

    @Test
    void devicesGetSeparateIncidents() {
        Long a = service.record(reading("evt-1", "temperature", "84", "80", AnomalySeverity.WARNING, T0)).orElseThrow();
        Long b = service.record(new FlaggedReading(
                "evt-2", "tenant-a", "sensor-2", "temperature", new BigDecimal("85"), new BigDecimal("80"),
                "THRESHOLD_BREACH", AnomalySeverity.WARNING, "hot", T0)).orElseThrow();

        assertThat(a).isNotEqualTo(b);
    }

    private static FlaggedReading reading(
            String eventId, String metric, String value, String threshold, AnomalySeverity severity, Instant at) {
        return new FlaggedReading(
                eventId, "tenant-a", "sensor-1", metric, new BigDecimal(value), new BigDecimal(threshold),
                "THRESHOLD_BREACH", severity, "reason", at);
    }
}
