package com.pulsestream.query.service;

import com.pulsestream.query.dto.ActivityBucketDto;
import com.pulsestream.query.dto.DeviceSummaryDto;
import com.pulsestream.query.dto.FacetsDto;
import com.pulsestream.query.dto.SummaryDto;
import jakarta.persistence.EntityManager;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.List;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.jdbc.AutoConfigureTestDatabase;
import org.springframework.boot.test.autoconfigure.orm.jpa.DataJpaTest;
import org.springframework.context.annotation.Import;
import org.springframework.test.context.ActiveProfiles;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

@ActiveProfiles("test")
@DataJpaTest
@AutoConfigureTestDatabase(replace = AutoConfigureTestDatabase.Replace.NONE)
@Import(PlatformMetadataService.class)
class PlatformMetadataServiceTest {

    private static final Instant T0 = Instant.parse("2026-09-01T10:00:00Z");

    @Autowired
    private EntityManager entityManager;

    @Autowired
    private PlatformMetadataService service;

    @BeforeEach
    void seed() {
        QueryServiceTestData.insertTelemetry(entityManager, 1L, "evt-1", "tenant-a", "device-1", "temperature", "20.0", T0);
        QueryServiceTestData.insertTelemetry(entityManager, 2L, "evt-2", "tenant-a", "device-2", "humidity", "55.0", T0.plusSeconds(60));
        QueryServiceTestData.insertTelemetry(entityManager, 3L, "evt-3", "tenant-b", "device-9", "pressure", "1013.0", T0.plusSeconds(120));
        QueryServiceTestData.insertAnomaly(entityManager, 1L, "evt-1", "tenant-a", "device-1", "temperature", "80.0", "CRITICAL", T0);
        entityManager.flush();
        entityManager.clear();
    }

    @Test
    void facetsWithoutATenantDescribeTheWholeStore() {
        FacetsDto facets = service.facets(null);

        assertThat(facets.tenants()).containsExactly("tenant-a", "tenant-b");
        assertThat(facets.devices()).containsExactly("device-1", "device-2", "device-9");
        assertThat(facets.metrics()).containsExactly("humidity", "pressure", "temperature");
        assertThat(facets.eventTypes()).containsExactly("telemetry.processed");
        assertThat(facets.anomalySeverities()).containsExactly("CRITICAL");
        assertThat(facets.anomalyTypes()).containsExactly("THRESHOLD_BREACH");
    }

    @Test
    void facetsScopeDevicesAndMetricsToTheTenantButKeepTheFullTenantList() {
        FacetsDto facets = service.facets("tenant-b");

        assertThat(facets.tenants()).containsExactly("tenant-a", "tenant-b");
        assertThat(facets.devices()).containsExactly("device-9");
        assertThat(facets.metrics()).containsExactly("pressure");
        assertThat(facets.anomalySeverities()).isEmpty();
    }

    @Test
    void summaryCountsEventsDevicesAndAnomaliesForTheTenant() {
        SummaryDto summary = service.summary("tenant-a");

        assertThat(summary.tenantId()).isEqualTo("tenant-a");
        assertThat(summary.processedEvents()).isEqualTo(2);
        assertThat(summary.devices()).isEqualTo(2);
        assertThat(summary.anomalies()).isEqualTo(1);
        assertThat(summary.latestEventTimestamp()).isEqualTo(T0.plusSeconds(60));
    }

    @Test
    void hourlyActivityCountsReadingsPerHourAndFillsQuietHoursWithZero() {
        // T0 is 10:00; seed a second reading in the same hour and one two hours later, so the hour
        // between them has to be materialised as an explicit zero.
        QueryServiceTestData.insertTelemetry(entityManager, 10L, "evt-10", "tenant-a", "device-1", "temperature", "21.0", T0.plusSeconds(600));
        QueryServiceTestData.insertTelemetry(entityManager, 11L, "evt-11", "tenant-a", "device-1", "temperature", "22.0", T0.plus(2, ChronoUnit.HOURS));
        entityManager.flush();
        entityManager.clear();

        List<ActivityBucketDto> buckets =
                service.hourlyActivity("tenant-a", T0, T0.plus(2, ChronoUnit.HOURS));

        assertThat(buckets).extracting(ActivityBucketDto::start).containsExactly(
                T0.truncatedTo(ChronoUnit.HOURS),
                T0.truncatedTo(ChronoUnit.HOURS).plus(1, ChronoUnit.HOURS),
                T0.truncatedTo(ChronoUnit.HOURS).plus(2, ChronoUnit.HOURS));
        assertThat(buckets).extracting(ActivityBucketDto::count).containsExactly(3L, 0L, 1L);
    }

    @Test
    void hourlyActivityRejectsAnInvertedOrOversizedWindow() {
        assertThatThrownBy(() -> service.hourlyActivity(null, T0.plus(1, ChronoUnit.HOURS), T0))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("'from' must not be after 'to'");

        assertThatThrownBy(() -> service.hourlyActivity(null, T0.minus(90, ChronoUnit.DAYS), T0))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("31 days");
    }

    @Test
    void devicesReportTheLatestReadingAndTotalCountPerDevice() {
        // A second, newer reading for device-1: the summary must show this one, not the first.
        QueryServiceTestData.insertTelemetry(entityManager, 12L, "evt-12", "tenant-a", "device-1", "temperature", "26.5", T0.plusSeconds(3600));
        entityManager.flush();
        entityManager.clear();

        List<DeviceSummaryDto> devices = service.devices("tenant-a", 10);

        assertThat(devices).extracting(DeviceSummaryDto::deviceId).containsExactly("device-1", "device-2");

        DeviceSummaryDto first = devices.get(0);
        assertThat(first.lastValue()).isEqualByComparingTo("26.5");
        assertThat(first.unit()).isEqualTo("C");
        assertThat(first.metric()).isEqualTo("temperature");
        assertThat(first.location()).isEqualTo("warehouse-1");
        assertThat(first.lastSeen()).isEqualTo(T0.plusSeconds(3600));
        assertThat(first.readings()).isEqualTo(2);
    }

    @Test
    void devicesHonourTheRequestedLimitAndTheTenantScope() {
        assertThat(service.devices("tenant-a", 1)).hasSize(1);
        assertThat(service.devices("tenant-b", 10)).extracting(DeviceSummaryDto::deviceId).containsExactly("device-9");
        assertThat(service.devices("tenant-missing", 10)).isEmpty();
    }

    @Test
    void summaryOfAnEmptyTenantReportsZerosAndNoLatestTimestamp() {
        SummaryDto summary = service.summary("tenant-missing");

        assertThat(summary.processedEvents()).isZero();
        assertThat(summary.devices()).isZero();
        assertThat(summary.anomalies()).isZero();
        assertThat(summary.latestEventTimestamp()).isNull();
    }
}
