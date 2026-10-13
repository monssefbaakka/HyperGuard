package com.pulsestream.query.dto;

import java.math.BigDecimal;
import java.time.Instant;

/**
 * A device and the state of its most recent reading, for the overview list.
 *
 * @param deviceId   the device
 * @param deviceType what kind of device it is
 * @param location   where it reported from
 * @param metric     what its latest reading measured
 * @param lastValue  the latest value
 * @param unit       unit of the latest value
 * @param lastSeen   when the latest reading was taken
 * @param readings   how many readings the device has recorded in total
 */
public record DeviceSummaryDto(
        String deviceId,
        String deviceType,
        String location,
        String metric,
        BigDecimal lastValue,
        String unit,
        Instant lastSeen,
        long readings) {
}
