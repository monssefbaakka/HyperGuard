package com.pulsestream.query.service;

import com.pulsestream.query.config.QueryProperties;
import com.pulsestream.query.dto.MetricSeriesDto;
import com.pulsestream.query.dto.PageResponseDto;
import com.pulsestream.query.dto.SeriesPointDto;
import com.pulsestream.query.dto.TelemetryRecordDto;
import com.pulsestream.query.model.ProcessedTelemetryEntity;
import com.pulsestream.query.repository.ProcessedTelemetryRepository;
import com.pulsestream.query.repository.TelemetrySpecifications;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.Set;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;
import org.springframework.data.jpa.domain.Specification;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Read queries over persisted processed telemetry.
 */
@Service
@Transactional(readOnly = true)
public class TelemetryQueryService {

    /**
     * Sortable columns, whitelisted so a request parameter can never name an arbitrary entity
     * attribute.
     */
    private static final Set<String> SORTABLE_FIELDS =
            Set.of("timestamp", "ingestedAt", "value", "deviceId", "metric", "tenantId", "eventType");

    private static final String DEFAULT_SORT_FIELD = "timestamp";

    private final ProcessedTelemetryRepository repository;
    private final QueryProperties properties;

    public TelemetryQueryService(ProcessedTelemetryRepository repository, QueryProperties properties) {
        this.repository = repository;
        this.properties = properties;
    }

    /**
     * Returns one page of telemetry rows matching the supplied filters.
     *
     * @throws IllegalArgumentException if the sort field is not sortable or the time window is inverted
     */
    public PageResponseDto<TelemetryRecordDto> search(
            String tenantId,
            String deviceId,
            String metric,
            String eventType,
            Instant from,
            Instant to,
            int page,
            int size,
            String sortField,
            Sort.Direction direction) {

        requireOrderedWindow(from, to);

        Pageable pageable = PageRequest.of(
                Math.max(page, 0),
                clampPageSize(size),
                Sort.by(direction, resolveSortField(sortField)));

        Specification<ProcessedTelemetryEntity> specification =
                TelemetrySpecifications.matchesAll(tenantId, deviceId, metric, eventType, from, to);

        Page<ProcessedTelemetryEntity> result = repository.findAll(specification, pageable);
        return PageResponseDto.from(result, TelemetryRecordDto::from);
    }

    /**
     * Returns a device/metric time series ordered oldest to newest.
     *
     * <p>The window is read newest-first and reversed, so when it holds more points than
     * {@code pulsestream.query.max-series-points} the caller keeps the most recent slice rather than
     * a stale prefix.
     */
    public MetricSeriesDto series(
            String tenantId,
            String deviceId,
            String metric,
            Instant from,
            Instant to,
            int limit) {

        requireOrderedWindow(from, to);

        int effectiveLimit = clampSeriesLimit(limit);
        Pageable newestFirst = PageRequest.of(0, effectiveLimit, Sort.by(Sort.Direction.DESC, "timestamp"));

        Specification<ProcessedTelemetryEntity> specification =
                TelemetrySpecifications.matchesAll(tenantId, deviceId, metric, null, from, to);

        Page<ProcessedTelemetryEntity> newestFirstPage = repository.findAll(specification, newestFirst);

        List<ProcessedTelemetryEntity> ordered = new ArrayList<>(newestFirstPage.getContent());
        Collections.reverse(ordered);

        List<SeriesPointDto> points = ordered.stream()
                .map(entity -> new SeriesPointDto(entity.getTimestamp(), entity.getValue()))
                .toList();

        String unit = ordered.isEmpty() ? null : ordered.get(ordered.size() - 1).getUnit();

        return new MetricSeriesDto(
                deviceId,
                metric,
                unit,
                points,
                newestFirstPage.getTotalElements() > points.size());
    }

    private int clampPageSize(int requested) {
        if (requested <= 0) {
            return 1;
        }
        return Math.min(requested, properties.maxPageSize());
    }

    private int clampSeriesLimit(int requested) {
        if (requested <= 0) {
            return properties.maxSeriesPoints();
        }
        return Math.min(requested, properties.maxSeriesPoints());
    }

    private String resolveSortField(String requested) {
        if (requested == null || requested.isBlank()) {
            return DEFAULT_SORT_FIELD;
        }
        if (!SORTABLE_FIELDS.contains(requested)) {
            throw new IllegalArgumentException(
                    "Unsupported sort field '" + requested + "'. Supported fields: " + sortedFields());
        }
        return requested;
    }

    private static String sortedFields() {
        return String.join(", ", SORTABLE_FIELDS.stream().sorted().toList());
    }

    static void requireOrderedWindow(Instant from, Instant to) {
        if (from != null && to != null && from.isAfter(to)) {
            throw new IllegalArgumentException("'from' must not be after 'to'");
        }
    }
}
