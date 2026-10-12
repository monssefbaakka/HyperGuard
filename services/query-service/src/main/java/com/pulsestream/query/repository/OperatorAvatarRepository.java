package com.pulsestream.query.repository;

import com.pulsestream.query.model.OperatorAvatarEntity;
import java.time.Instant;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface OperatorAvatarRepository extends JpaRepository<OperatorAvatarEntity, Long> {

    /** When the photo last changed, without loading its bytes; empty when the operator has none. */
    @Query("select a.updatedAt from OperatorAvatarEntity a where a.operatorId = :operatorId")
    Optional<Instant> findUpdatedAt(@Param("operatorId") Long operatorId);
}
