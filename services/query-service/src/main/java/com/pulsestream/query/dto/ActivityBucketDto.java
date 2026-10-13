package com.pulsestream.query.dto;

import java.time.Instant;

/**
 * Number of readings recorded in one hour-long bucket.
 *
 * @param start start of the hour, in UTC
 * @param count readings recorded within it
 */
public record ActivityBucketDto(Instant start, long count) {
}
