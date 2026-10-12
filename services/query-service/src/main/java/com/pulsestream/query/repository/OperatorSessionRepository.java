package com.pulsestream.query.repository;

import com.pulsestream.query.model.OperatorSessionEntity;
import java.time.Instant;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface OperatorSessionRepository extends JpaRepository<OperatorSessionEntity, Long> {

    Optional<OperatorSessionEntity> findByTokenHash(String tokenHash);

    @Modifying
    @Query("delete from OperatorSessionEntity s where s.tokenHash = :tokenHash")
    int deleteByTokenHash(@Param("tokenHash") String tokenHash);

    @Modifying
    @Query("delete from OperatorSessionEntity s where s.expiresAt <= :now")
    int deleteExpired(@Param("now") Instant now);
}
