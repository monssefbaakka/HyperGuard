package com.pulsestream.query.service;

import com.pulsestream.query.dto.ActivityBucketDto;
import com.pulsestream.query.dto.DeviceSummaryDto;
import com.pulsestream.query.dto.FacetsDto;
import com.pulsestream.query.dto.SummaryDto;
import com.pulsestream.query.repository.AnomalyRepository;
import com.pulsestream.query.repository.ProcessedTelemetryRepository;
import java.time.Duration;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

/**
 * Aggregate views used to drive the dashboard: the distinct values available for filtering, the
 * headline counters, the shape of recent activity, and the state of each device.
 */
@Service
@Transactional(readOnly = true)
public class PlatformMetadataService {

    /** Widest activity window a caller may ask for, so one request cannot scan the whole table. */
    private static final Duration MAX_ACTIVITY_WINDOW = Duration.ofDays(31);

    private static final int MAX_DEVICES = 100;
    private static final int DEFAULT_DEVICES = 12;

    private final ProcessedTelemetryRepository telemetryRepository;
    private final AnomalyRepository anomalyRepository;

    public PlatformMetadataService(
            ProcessedTelemetryRepository telemetryRepository,
            AnomalyRepository anomalyRepository) {
        this.telemetryRepository = telemetryRepository;
        this.anomalyRepository = anomalyRepository;
    }

    /**
     * Distinct filter values, scoped to a tenant when one is supplied.
     *
     * <p>The tenant list itself is always unscoped so the UI can offer a tenant switch even while a
     * tenant filter is active.
     */
    public FacetsDto facets(String tenantId) {
        String scope = normalize(tenantId);

        return new FacetsDto(
                telemetryRepository.findDistinctTenantIds(),
                telemetryRepository.findDistinctDeviceIds(scope),
                telemetryRepository.findDistinctMetrics(scope),
                telemetryRepository.findDistinctEventTypes(scope),
                anomalyRepository.findDistinctSeverities(scope),
                anomalyRepository.findDistinctAnomalyTypes(scope));
    }

    public SummaryDto summary(String tenantId) {
        String scope = normalize(tenantId);

        return new SummaryDto(
                scope,
                telemetryRepository.countByTenant(scope),
                anomalyRepository.countByTenant(scope),
                telemetryRepository.countDistinctDevices(scope),
                telemetryRepository.findLatestEventTimestamp(scope));
    }

    /**
     * Readings per hour over a window, with quiet hours returned explicitly as zero.
     *
     * <p>A chart drawn from only the hours that have data would join a Friday to the following
     * Monday with a straight line and hide the gap entirely, so the empty hours are materialised
     * here rather than left to the client.
     *
     * @throws IllegalArgumentException if the window is inverted or wider than a month
     */
    public List<ActivityBucketDto> hourlyActivity(String tenantId, Instant from, Instant to) {
        Instant end = to == null ? Instant.now() : to;
        Instant start = from == null ? end.minus(24, ChronoUnit.HOURS) : from;

        if (start.isAfter(end)) {
            throw new IllegalArgumentException("'from' must not be after 'to'");
        }
        if (Duration.between(start, end).compareTo(MAX_ACTIVITY_WINDOW) > 0) {
            throw new IllegalArgumentException("Activity window must not be wider than 31 days");
        }

        Map<Instant, Long> counts = new HashMap<>();
        for (Object[] row : telemetryRepository.findHourlyActivity(normalize(tenantId), start, end)) {
            counts.put(SqlValues.toInstant(row[0]), SqlValues.toLong(row[1]));
        }

        List<ActivityBucketDto> buckets = new ArrayList<>();
        Instant cursor = start.truncatedTo(ChronoUnit.HOURS);
        Instant last = end.truncatedTo(ChronoUnit.HOURS);
        while (!cursor.isAfter(last)) {
            buckets.add(new ActivityBucketDto(cursor, counts.getOrDefault(cursor, 0L)));
            cursor = cursor.plus(1, ChronoUnit.HOURS);
        }
        return buckets;
    }

    /** Each device with its latest reading, most recently active first. */
    public List<DeviceSummaryDto> devices(String tenantId, int limit) {
        int effectiveLimit = limit <= 0 ? DEFAULT_DEVICES : Math.min(limit, MAX_DEVICES);

        return telemetryRepository.findDeviceSummaries(normalize(tenantId), effectiveLimit).stream()
                .map(row -> new DeviceSummaryDto(
                        SqlValues.toStringValue(row[0]),
                        SqlValues.toStringValue(row[1]),
                        SqlValues.toStringValue(row[2]),
                        SqlValues.toStringValue(row[3]),
                        SqlValues.toDecimal(row[4]),
                        SqlValues.toStringValue(row[5]),
                        SqlValues.toInstant(row[6]),
                        SqlValues.toLong(row[7])))
                .toList();
    }

    private static String normalize(String tenantId) {
        return StringUtils.hasText(tenantId) ? tenantId : null;
    }
}
