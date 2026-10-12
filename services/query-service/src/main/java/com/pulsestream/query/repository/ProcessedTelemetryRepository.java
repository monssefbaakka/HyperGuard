package com.pulsestream.query.repository;

import com.pulsestream.query.model.ProcessedTelemetryEntity;
import java.time.Instant;
import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.JpaSpecificationExecutor;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

/**
 * Read-side repository for persisted processed telemetry events.
 *
 * <p>The two aggregate queries are native because they need {@code date_trunc} and a window
 * function. Both are written in the SQL subset Postgres and H2's PostgreSQL mode agree on, so the
 * tests exercise the same statements that run in production: identifiers that collide with type
 * names ({@code timestamp}, {@code value}) are quoted, aliases are quoted to keep their camel case,
 * and the optional tenant parameter is cast so Postgres can infer its type when it is null.
 */
public interface ProcessedTelemetryRepository
        extends JpaRepository<ProcessedTelemetryEntity, Long>, JpaSpecificationExecutor<ProcessedTelemetryEntity> {

    @Query("select distinct e.tenantId from ProcessedTelemetryEntity e order by e.tenantId")
    List<String> findDistinctTenantIds();

    /** Tenants that have reported readings from this device id; device ids are only unique per tenant. */
    @Query("select distinct e.tenantId from ProcessedTelemetryEntity e where e.deviceId = :deviceId order by e.tenantId")
    List<String> findTenantsReportingDevice(@Param("deviceId") String deviceId);

    @Query("""
            select distinct e.deviceId from ProcessedTelemetryEntity e
            where (:tenantId is null or e.tenantId = :tenantId)
            order by e.deviceId
            """)
    List<String> findDistinctDeviceIds(@Param("tenantId") String tenantId);

    @Query("""
            select distinct e.metric from ProcessedTelemetryEntity e
            where (:tenantId is null or e.tenantId = :tenantId)
            order by e.metric
            """)
    List<String> findDistinctMetrics(@Param("tenantId") String tenantId);

    @Query("""
            select distinct e.eventType from ProcessedTelemetryEntity e
            where (:tenantId is null or e.tenantId = :tenantId)
            order by e.eventType
            """)
    List<String> findDistinctEventTypes(@Param("tenantId") String tenantId);

    @Query("""
            select count(e) from ProcessedTelemetryEntity e
            where (:tenantId is null or e.tenantId = :tenantId)
            """)
    long countByTenant(@Param("tenantId") String tenantId);

    @Query("""
            select count(distinct e.deviceId) from ProcessedTelemetryEntity e
            where (:tenantId is null or e.tenantId = :tenantId)
            """)
    long countDistinctDevices(@Param("tenantId") String tenantId);

    @Query("""
            select max(e.timestamp) from ProcessedTelemetryEntity e
            where (:tenantId is null or e.tenantId = :tenantId)
            """)
    Instant findLatestEventTimestamp(@Param("tenantId") String tenantId);

    /**
     * Readings per hour across a window, as {@code [bucket start, count]} ordered oldest first.
     *
     * <p>Hours with no readings are absent rather than zero; the caller fills the gaps so a quiet
     * period is drawn as a gap at zero instead of the line jumping over it.
     */
    @Query(nativeQuery = true, value = """
            select date_trunc('hour', t."timestamp") as "bucketStart", count(*) as "readings"
            from platform.processed_telemetry t
            where (cast(:tenantId as varchar) is null or t.tenant_id = cast(:tenantId as varchar))
              and t."timestamp" >= :from
              and t."timestamp" <= :to
            group by date_trunc('hour', t."timestamp")
            order by date_trunc('hour', t."timestamp")
            """)
    List<Object[]> findHourlyActivity(
            @Param("tenantId") String tenantId,
            @Param("from") Instant from,
            @Param("to") Instant to);

    /**
     * One row per device carrying its most recent reading and its total reading count, most recently
     * active first.
     */
    @Query(nativeQuery = true, value = """
            select ranked."deviceId",
                   ranked."deviceType",
                   ranked."location",
                   ranked."metric",
                   ranked."lastValue",
                   ranked."unit",
                   ranked."lastSeen",
                   ranked."readings"
            from (
                select t.device_id as "deviceId",
                       t.device_type as "deviceType",
                       t.location as "location",
                       t.metric as "metric",
                       t."value" as "lastValue",
                       t.unit as "unit",
                       t."timestamp" as "lastSeen",
                       count(*) over (partition by t.device_id) as "readings",
                       row_number() over (partition by t.device_id order by t."timestamp" desc, t.id desc) as "rank"
                from platform.processed_telemetry t
                where (cast(:tenantId as varchar) is null or t.tenant_id = cast(:tenantId as varchar))
            ) ranked
            where ranked."rank" = 1
            order by ranked."lastSeen" desc
            limit :maxDevices
            """)
    List<Object[]> findDeviceSummaries(
            @Param("tenantId") String tenantId,
            @Param("maxDevices") int maxDevices);
}
