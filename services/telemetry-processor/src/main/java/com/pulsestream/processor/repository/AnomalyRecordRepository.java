package com.pulsestream.processor.repository;

import com.pulsestream.processor.model.AnomalyRecordEntity;
import org.springframework.data.jpa.repository.JpaRepository;

/** Flagged readings written by the processor. */
public interface AnomalyRecordRepository extends JpaRepository<AnomalyRecordEntity, Long> {

    boolean existsByEventId(String eventId);
}
