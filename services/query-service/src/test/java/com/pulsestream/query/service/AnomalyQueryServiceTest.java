package com.pulsestream.query.service;

import com.pulsestream.query.config.QueryProperties;
import com.pulsestream.query.dto.AnomalyRecordDto;
import com.pulsestream.query.dto.PageResponseDto;
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
@Import({AnomalyQueryService.class, AnomalyQueryServiceTest.Properties.class})
class AnomalyQueryServiceTest {

    private static final Instant T0 = Instant.parse("2026-09-01T10:00:00Z");

    @TestConfiguration
    static class Properties {

        @Bean
        QueryProperties queryProperties() {
            return new QueryProperties(100, 100, List.of());
        }
    }

    @Autowired
    private EntityManager entityManager;

    @Autowired
    private AnomalyQueryService service;

    @BeforeEach
    void seed() {
        QueryServiceTestData.insertAnomaly(entityManager, 1L, "evt-1", "tenant-a", "device-1", "temperature", "80.0", "CRITICAL", T0);
        QueryServiceTestData.insertAnomaly(entityManager, 2L, "evt-2", "tenant-a", "device-2", "humidity", "95.0", "WARNING", T0.plusSeconds(60));
        QueryServiceTestData.insertAnomaly(entityManager, 3L, "evt-3", "tenant-b", "device-9", "temperature", "70.0", "CRITICAL", T0.plusSeconds(120));
        entityManager.flush();
        entityManager.clear();
    }

    @Test
    void searchReturnsAnomaliesNewestFirstWithTheStoredThreshold() {
        PageResponseDto<AnomalyRecordDto> page =
                service.search(null, null, null, null, null, null, null, 0, 50, null, Sort.Direction.DESC);

        assertThat(page.totalElements()).isEqualTo(3);
        assertThat(page.content()).extracting(AnomalyRecordDto::eventId).containsExactly("evt-3", "evt-2", "evt-1");
        assertThat(page.content().get(0).threshold()).isEqualByComparingTo("30.0000");
    }

    @Test
    void severityIsMatchedCaseInsensitively() {
        PageResponseDto<AnomalyRecordDto> page =
                service.search(null, null, null, "critical", null, null, null, 0, 50, null, Sort.Direction.DESC);

        assertThat(page.content()).extracting(AnomalyRecordDto::eventId).containsExactly("evt-3", "evt-1");
    }

    @Test
    void tenantAndTimeWindowFiltersCombine() {
        PageResponseDto<AnomalyRecordDto> page = service.search(
                "tenant-a", null, null, null, null, T0.plusSeconds(30), null, 0, 50, null, Sort.Direction.DESC);

        assertThat(page.content()).extracting(AnomalyRecordDto::eventId).containsExactly("evt-2");
    }

    @Test
    void unsupportedSortFieldIsRejected() {
        assertThatThrownBy(() -> service.search(
                null, null, null, null, null, null, null, 0, 50, "unknownColumn", Sort.Direction.DESC))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("Unsupported sort field");
    }
}
