package com.pulsestream.query.repository;

import com.pulsestream.query.model.OperatorEntity;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;

public interface OperatorRepository extends JpaRepository<OperatorEntity, Long> {

    Optional<OperatorEntity> findByUsername(String username);

    boolean existsByUsername(String username);
}
