package com.pulsestream.query.exception;

/** Failures of the triage endpoints, each mapped to its own HTTP status. */
public final class ResourceExceptions {

    private ResourceExceptions() {
    }

    /** The incident, device or quarantine entry does not exist: 404. */
    public static class NotFoundException extends RuntimeException {
        public NotFoundException(String message) {
            super(message);
        }
    }

    /** The action does not fit the resource's current state, such as resolving twice: 409. */
    public static class StateConflictException extends RuntimeException {
        public StateConflictException(String message) {
            super(message);
        }
    }
}
