package com.pulsestream.processor.repository;

import com.pulsestream.processor.model.IncidentEntity;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

/** Incidents opened and extended by anomaly correlation. */
public interface IncidentRepository extends JpaRepository<IncidentEntity, Long> {

    /** The device's active (not resolved) incident; the schema allows at most one. */
    @Query("""
            select i from IncidentEntity i
            where i.tenantId = :tenantId and i.deviceId = :deviceId and i.status <> 'RESOLVED'
            """)
    Optional<IncidentEntity> findActive(@Param("tenantId") String tenantId, @Param("deviceId") String deviceId);
}
