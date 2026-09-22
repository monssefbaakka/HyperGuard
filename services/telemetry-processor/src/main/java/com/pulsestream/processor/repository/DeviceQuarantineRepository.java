package com.pulsestream.processor.repository;

import com.pulsestream.processor.model.DeviceQuarantineEntity;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.transaction.annotation.Transactional;

/** Read side of device quarantine, plus the counter of readings dropped while quarantined. */
public interface DeviceQuarantineRepository
        extends JpaRepository<DeviceQuarantineEntity, DeviceQuarantineEntity.Key> {

    @Modifying
    @Transactional
    @Query("""
            update DeviceQuarantineEntity q set q.suppressedEvents = q.suppressedEvents + :count
            where q.key.tenantId = :tenantId and q.key.deviceId = :deviceId
            """)
    int addSuppressed(@Param("tenantId") String tenantId, @Param("deviceId") String deviceId, @Param("count") long count);
}
