package com.pulsestream.query.controller;

import org.springframework.data.domain.Sort;

/**
 * Parses the {@code direction} request parameter.
 *
 * <p>Spring's default string-to-enum conversion is case sensitive, which would reject the lowercase
 * {@code asc}/{@code desc} that every client naturally sends, so the endpoints go through
 * {@link Sort.Direction#fromString(String)} instead and surface a 400 with the accepted values.
 */
final class SortDirections {

    private SortDirections() {
    }

    static Sort.Direction parse(String direction) {
        if (direction == null || direction.isBlank()) {
            return Sort.Direction.DESC;
        }
        try {
            return Sort.Direction.fromString(direction);
        } catch (IllegalArgumentException ex) {
            throw new IllegalArgumentException("Unsupported sort direction '" + direction + "'. Use 'asc' or 'desc'.");
        }
    }
}
