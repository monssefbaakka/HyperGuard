package com.pulsestream.ingestion.resilience;

import java.util.function.Predicate;
import org.apache.kafka.common.errors.RecordTooLargeException;
import org.apache.kafka.common.errors.SerializationException;

/**
 * Decides which publish failures count against the Kafka circuit breaker.
 *
 * <p>The breaker exists to detect an unhealthy broker. A failure caused by the record
 * itself (it cannot be serialized, or it exceeds the broker's size limit) says nothing
 * about broker health, so it is not recorded. Otherwise a stream of bad records could
 * open the breaker and reject healthy traffic.
 *
 * <p>Referenced by class name from {@code resilience4j.circuitbreaker.instances.*.record-failure-predicate},
 * so it must keep a public no-argument constructor.
 */
public class BrokerFailurePredicate implements Predicate<Throwable> {

    @Override
    public boolean test(Throwable throwable) {
        Throwable current = throwable;
        while (current != null) {
            if (current instanceof SerializationException || current instanceof RecordTooLargeException) {
                return false;
            }
            if (current.getCause() == current) {
                break;
            }
            current = current.getCause();
        }
        return true;
    }
}
