package com.pulsestream.query.repository;

import com.pulsestream.query.model.AnomalyEntity;
import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.JpaSpecificationExecutor;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

/**
 * Read-side repository for persisted anomaly records.
 */
public interface AnomalyRepository
        extends JpaRepository<AnomalyEntity, Long>, JpaSpecificationExecutor<AnomalyEntity> {

    @Query("""
            select distinct a.severity from AnomalyEntity a
            where (:tenantId is null or a.tenantId = :tenantId)
            order by a.severity
            """)
    List<String> findDistinctSeverities(@Param("tenantId") String tenantId);

    @Query("""
            select distinct a.anomalyType from AnomalyEntity a
            where (:tenantId is null or a.tenantId = :tenantId)
            order by a.anomalyType
            """)
    List<String> findDistinctAnomalyTypes(@Param("tenantId") String tenantId);

    @Query("""
            select count(a) from AnomalyEntity a
            where (:tenantId is null or a.tenantId = :tenantId)
            """)
    long countByTenant(@Param("tenantId") String tenantId);

    /** The readings correlated into one incident, oldest first, capped by the page size. */
    List<AnomalyEntity> findByIncidentIdOrderByTimestampAsc(Long incidentId, org.springframework.data.domain.Pageable page);
}
