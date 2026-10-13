package com.pulsestream.query.service;

import java.math.BigDecimal;
import java.sql.Timestamp;
import java.time.Instant;
import java.time.LocalDateTime;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;

/**
 * Converts the loosely typed values a native query returns.
 *
 * <p>The JDBC driver decides what a {@code timestamptz} or {@code numeric} column comes back as, and
 * Postgres and H2 do not agree, so the aggregate queries normalise here rather than assuming one
 * shape and failing on the other.
 */
final class SqlValues {

    private SqlValues() {
    }

    static Instant toInstant(Object value) {
        if (value == null) {
            return null;
        }
        if (value instanceof Instant instant) {
            return instant;
        }
        if (value instanceof OffsetDateTime offsetDateTime) {
            return offsetDateTime.toInstant();
        }
        if (value instanceof Timestamp timestamp) {
            return timestamp.toInstant();
        }
        if (value instanceof LocalDateTime localDateTime) {
            // A driver that drops the zone has already normalised to UTC for a timestamptz column.
            return localDateTime.toInstant(ZoneOffset.UTC);
        }
        throw new IllegalStateException("Unsupported timestamp type: " + value.getClass());
    }

    static BigDecimal toDecimal(Object value) {
        if (value == null) {
            return null;
        }
        if (value instanceof BigDecimal decimal) {
            return decimal;
        }
        if (value instanceof Number number) {
            return BigDecimal.valueOf(number.doubleValue());
        }
        return new BigDecimal(value.toString());
    }

    static long toLong(Object value) {
        if (value == null) {
            return 0L;
        }
        if (value instanceof Number number) {
            return number.longValue();
        }
        return Long.parseLong(value.toString());
    }

    static String toStringValue(Object value) {
        return value == null ? null : value.toString();
    }
}
