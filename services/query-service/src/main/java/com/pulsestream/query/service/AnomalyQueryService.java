package com.pulsestream.query.service;

import com.pulsestream.query.config.QueryProperties;
import com.pulsestream.query.dto.AnomalyRecordDto;
import com.pulsestream.query.dto.PageResponseDto;
import com.pulsestream.query.model.AnomalyEntity;
import com.pulsestream.query.repository.AnomalyRepository;
import com.pulsestream.query.repository.AnomalySpecifications;
import java.time.Instant;
import java.util.Set;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;
import org.springframework.data.jpa.domain.Specification;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Read queries over persisted anomaly records.
 */
@Service
@Transactional(readOnly = true)
public class AnomalyQueryService {

    private static final Set<String> SORTABLE_FIELDS =
            Set.of("timestamp", "ingestedAt", "value", "threshold", "deviceId", "metric", "severity", "anomalyType");

    private static final String DEFAULT_SORT_FIELD = "timestamp";

    private final AnomalyRepository repository;
    private final QueryProperties properties;

    public AnomalyQueryService(AnomalyRepository repository, QueryProperties properties) {
        this.repository = repository;
        this.properties = properties;
    }

    public PageResponseDto<AnomalyRecordDto> search(
            String tenantId,
            String deviceId,
            String metric,
            String severity,
            String anomalyType,
            Instant from,
            Instant to,
            int page,
            int size,
            String sortField,
            Sort.Direction direction) {

        TelemetryQueryService.requireOrderedWindow(from, to);

        Pageable pageable = PageRequest.of(
                Math.max(page, 0),
                clampPageSize(size),
                Sort.by(direction, resolveSortField(sortField)));

        Specification<AnomalyEntity> specification =
                AnomalySpecifications.matchesAll(tenantId, deviceId, metric, severity, anomalyType, from, to);

        Page<AnomalyEntity> result = repository.findAll(specification, pageable);
        return PageResponseDto.from(result, AnomalyRecordDto::from);
    }

    private int clampPageSize(int requested) {
        if (requested <= 0) {
            return 1;
        }
        return Math.min(requested, properties.maxPageSize());
    }

    private String resolveSortField(String requested) {
        if (requested == null || requested.isBlank()) {
            return DEFAULT_SORT_FIELD;
        }
        if (!SORTABLE_FIELDS.contains(requested)) {
            throw new IllegalArgumentException(
                    "Unsupported sort field '" + requested + "'. Supported fields: "
                            + String.join(", ", SORTABLE_FIELDS.stream().sorted().toList()));
        }
        return requested;
    }
}
