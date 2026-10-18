package com.pulsestream.query.repository;

import com.pulsestream.query.model.IncidentEntity;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.JpaSpecificationExecutor;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

/** Incidents correlated by telemetry-processor, triaged through this service. */
public interface IncidentRepository
        extends JpaRepository<IncidentEntity, Long>, JpaSpecificationExecutor<IncidentEntity> {

    @Query("""
            select count(i) from IncidentEntity i
            where i.status <> 'RESOLVED' and (:tenantId is null or i.tenantId = :tenantId)
            """)
    long countActive(@Param("tenantId") String tenantId);
}
