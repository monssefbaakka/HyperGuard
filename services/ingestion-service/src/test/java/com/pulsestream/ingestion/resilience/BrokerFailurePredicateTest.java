package com.pulsestream.ingestion.resilience;

import org.apache.kafka.common.KafkaException;
import org.apache.kafka.common.errors.RecordTooLargeException;
import org.apache.kafka.common.errors.SerializationException;
import org.apache.kafka.common.errors.TimeoutException;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

class BrokerFailurePredicateTest {

    private final BrokerFailurePredicate predicate = new BrokerFailurePredicate();

    @Test
    @DisplayName("should record broker-side failures")
    void shouldRecordBrokerFailures() {
        assertThat(predicate.test(new KafkaException("broker unavailable"))).isTrue();
        assertThat(predicate.test(new RuntimeException(new TimeoutException("metadata timeout")))).isTrue();
    }

    @Test
    @DisplayName("should ignore record-level failures anywhere in the cause chain")
    void shouldIgnoreRecordLevelFailures() {
        assertThat(predicate.test(new SerializationException("bad payload"))).isFalse();
        assertThat(predicate.test(new RuntimeException(new RecordTooLargeException("too big")))).isFalse();
    }
}
