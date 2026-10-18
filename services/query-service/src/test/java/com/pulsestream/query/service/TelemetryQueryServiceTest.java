package com.pulsestream.query.service;

import com.pulsestream.query.config.QueryProperties;
import com.pulsestream.query.dto.MetricSeriesDto;
import com.pulsestream.query.dto.PageResponseDto;
import com.pulsestream.query.dto.TelemetryRecordDto;
import jakarta.persistence.EntityManager;
import java.time.Instant;
import java.util.List;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.jdbc.AutoConfigureTestDatabase;
import org.springframework.boot.test.autoconfigure.orm.jpa.DataJpaTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.data.domain.Sort;
import org.springframework.test.context.ActiveProfiles;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

@ActiveProfiles("test")
@DataJpaTest
@AutoConfigureTestDatabase(replace = AutoConfigureTestDatabase.Replace.NONE)
@Import({TelemetryQueryService.class, TelemetryQueryServiceTest.Properties.class})
class TelemetryQueryServiceTest {

    private static final Instant T0 = Instant.parse("2026-09-01T10:00:00Z");

    @TestConfiguration
    static class Properties {

        @Bean
        QueryProperties queryProperties() {
            return new QueryProperties(100, 3, List.of());
        }
    }

    @Autowired
    private EntityManager entityManager;

    @Autowired
    private TelemetryQueryService service;

    @BeforeEach
    void seed() {
        QueryServiceTestData.insertTelemetry(entityManager, 1L, "evt-1", "tenant-a", "device-1", "temperature", "20.0", T0);
        QueryServiceTestData.insertTelemetry(entityManager, 2L, "evt-2", "tenant-a", "device-1", "temperature", "21.0", T0.plusSeconds(60));
        QueryServiceTestData.insertTelemetry(entityManager, 3L, "evt-3", "tenant-a", "device-1", "temperature", "22.0", T0.plusSeconds(120));
        QueryServiceTestData.insertTelemetry(entityManager, 4L, "evt-4", "tenant-a", "device-1", "temperature", "23.0", T0.plusSeconds(180));
        QueryServiceTestData.insertTelemetry(entityManager, 5L, "evt-5", "tenant-a", "device-2", "humidity", "55.0", T0.plusSeconds(90));
        QueryServiceTestData.insertTelemetry(entityManager, 6L, "evt-6", "tenant-b", "device-9", "temperature", "-4.0", T0.plusSeconds(30));
        entityManager.flush();
        entityManager.clear();
    }

    @Test
    void searchWithoutFiltersReturnsEveryRowNewestFirst() {
        PageResponseDto<TelemetryRecordDto> page =
                service.search(null, null, null, null, null, null, 0, 50, "timestamp", Sort.Direction.DESC);

        assertThat(page.totalElements()).isEqualTo(6);
        assertThat(page.content()).extracting(TelemetryRecordDto::eventId)
                .containsExactly("evt-4", "evt-3", "evt-5", "evt-2", "evt-6", "evt-1");
        assertThat(page.hasNext()).isFalse();
    }

    @Test
    void filtersNarrowTheResultToTheMatchingTenantDeviceAndMetric() {
        PageResponseDto<TelemetryRecordDto> page =
                service.search("tenant-a", "device-2", "humidity", null, null, null, 0, 50, null, Sort.Direction.DESC);

        assertThat(page.content()).extracting(TelemetryRecordDto::eventId).containsExactly("evt-5");
    }

    @Test
    void timeWindowIsInclusiveOnBothBounds() {
        PageResponseDto<TelemetryRecordDto> page = service.search(
                null, "device-1", null, null, T0.plusSeconds(60), T0.plusSeconds(120), 0, 50, null, Sort.Direction.ASC);

        assertThat(page.content()).extracting(TelemetryRecordDto::eventId).containsExactly("evt-2", "evt-3");
    }

    @Test
    void pagingReportsTotalsAcrossTheWholeMatchAndFlagsMorePages() {
        PageResponseDto<TelemetryRecordDto> page =
                service.search("tenant-a", "device-1", null, null, null, null, 0, 2, "timestamp", Sort.Direction.ASC);

        assertThat(page.content()).extracting(TelemetryRecordDto::eventId).containsExactly("evt-1", "evt-2");
        assertThat(page.totalElements()).isEqualTo(4);
        assertThat(page.totalPages()).isEqualTo(2);
        assertThat(page.hasNext()).isTrue();
    }

    @Test
    void pageSizeIsCappedAtTheConfiguredMaximum() {
        PageResponseDto<TelemetryRecordDto> page =
                service.search(null, null, null, null, null, null, 0, 5_000, null, Sort.Direction.DESC);

        assertThat(page.size()).isEqualTo(100);
    }

    @Test
    void unsupportedSortFieldIsRejectedRatherThanPassedToTheEntityModel() {
        assertThatThrownBy(() -> service.search(
                null, null, null, null, null, null, 0, 10, "location; drop table", Sort.Direction.DESC))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("Unsupported sort field");
    }

    @Test
    void invertedTimeWindowIsRejected() {
        assertThatThrownBy(() -> service.search(
                null, null, null, null, T0.plusSeconds(120), T0, 0, 10, null, Sort.Direction.DESC))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("'from' must not be after 'to'");
    }

    @Test
    void seriesReturnsPointsOldestFirstWithTheUnitFromTheData() {
        MetricSeriesDto series = service.series("tenant-a", "device-1", "temperature", T0, T0.plusSeconds(120), 10);

        assertThat(series.deviceId()).isEqualTo("device-1");
        assertThat(series.metric()).isEqualTo("temperature");
        assertThat(series.unit()).isEqualTo("C");
        assertThat(series.points()).extracting(point -> point.value().doubleValue())
                .containsExactly(20.0, 21.0, 22.0);
        assertThat(series.truncated()).isFalse();
    }

    @Test
    void seriesKeepsTheNewestPointsAndFlagsTruncationWhenTheWindowIsLarger() {
        MetricSeriesDto series = service.series("tenant-a", "device-1", "temperature", null, null, 0);

        // max-series-points is 3 in this test, and device-1 has four temperature readings.
        assertThat(series.points()).extracting(point -> point.value().doubleValue())
                .containsExactly(21.0, 22.0, 23.0);
        assertThat(series.truncated()).isTrue();
    }

    @Test
    void seriesForAnUnknownDeviceIsEmptyRatherThanAnError() {
        MetricSeriesDto series = service.series(null, "device-missing", "temperature", null, null, 10);

        assertThat(series.points()).isEmpty();
        assertThat(series.unit()).isNull();
        assertThat(series.truncated()).isFalse();
    }
}
