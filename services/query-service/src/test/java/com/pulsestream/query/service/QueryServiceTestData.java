package com.pulsestream.query.service;

import jakarta.persistence.EntityManager;
import java.time.Instant;

/**
 * Inserts fixture rows straight through JDBC.
 *
 * <p>The query service maps {@code platform.processed_telemetry} and {@code platform.anomalies}
 * read-only, so the entities deliberately expose no constructors or setters a test could use; rows
 * are written the way the owning services write them, with SQL.
 */
final class QueryServiceTestData {

    private QueryServiceTestData() {
    }

    static void insertTelemetry(
            EntityManager entityManager,
            long id,
            String eventId,
            String tenantId,
            String deviceId,
            String metric,
            String value,
            Instant timestamp) {

        entityManager.createNativeQuery("""
                        insert into platform.processed_telemetry
                            (id, event_id, tenant_id, event_type, timestamp, source, device_id, device_type,
                             metric, value, unit, location, ingested_at)
                        values (?, ?, ?, 'telemetry.processed', ?, 'ingestion-service', ?, 'sensor',
                                ?, ?, 'C', 'warehouse-1', ?)
                        """)
                .setParameter(1, id)
                .setParameter(2, eventId)
                .setParameter(3, tenantId)
                .setParameter(4, timestamp)
                .setParameter(5, deviceId)
                .setParameter(6, metric)
                .setParameter(7, new java.math.BigDecimal(value))
                .setParameter(8, timestamp)
                .executeUpdate();
    }

    static void insertAnomaly(
            EntityManager entityManager,
            long id,
            String eventId,
            String tenantId,
            String deviceId,
            String metric,
            String value,
            String severity,
            Instant timestamp) {

        entityManager.createNativeQuery("""
                        insert into platform.anomalies
                            (id, event_id, tenant_id, timestamp, device_id, metric, value, threshold,
                             anomaly_type, severity, ingested_at)
                        values (?, ?, ?, ?, ?, ?, ?, 30.0000, 'THRESHOLD_BREACH', ?, ?)
                        """)
                .setParameter(1, id)
                .setParameter(2, eventId)
                .setParameter(3, tenantId)
                .setParameter(4, timestamp)
                .setParameter(5, deviceId)
                .setParameter(6, metric)
                .setParameter(7, new java.math.BigDecimal(value))
                .setParameter(8, severity)
                .setParameter(9, timestamp)
                .executeUpdate();
    }
}
