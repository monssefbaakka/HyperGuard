package com.pulsestream.query.repository;

import com.pulsestream.query.model.DeviceQuarantineEntity;
import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

/** Quarantined devices, created and released by operators. */
public interface DeviceQuarantineRepository
        extends JpaRepository<DeviceQuarantineEntity, DeviceQuarantineEntity.Key> {

    @Query("""
            select q from DeviceQuarantineEntity q
            where (:tenantId is null or q.key.tenantId = :tenantId)
            order by q.quarantinedAt desc
            """)
    List<DeviceQuarantineEntity> findByTenant(@Param("tenantId") String tenantId);
}
