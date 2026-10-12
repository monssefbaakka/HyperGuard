package com.pulsestream.query.exception;

/** Failures of the console sign-in flow, each mapped to its own HTTP status. */
public final class AuthExceptions {

    private AuthExceptions() {
    }

    /** No valid session, or wrong credentials: 401. */
    public static class UnauthorizedException extends RuntimeException {
        public UnauthorizedException(String message) {
            super(message);
        }
    }

    /** The username is already taken: 409. */
    public static class ConflictException extends RuntimeException {
        public ConflictException(String message) {
            super(message);
        }
    }

    /** Self-service registration is switched off: 403. */
    public static class ForbiddenException extends RuntimeException {
        public ForbiddenException(String message) {
            super(message);
        }
    }

    /** The uploaded photo is not an accepted image or is too large: 400 / 413. */
    public static class InvalidAvatarException extends RuntimeException {
        private final boolean tooLarge;

        public InvalidAvatarException(String message, boolean tooLarge) {
            super(message);
            this.tooLarge = tooLarge;
        }

        public boolean isTooLarge() {
            return tooLarge;
        }
    }
}
