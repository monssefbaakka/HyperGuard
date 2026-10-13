package com.pulsestream.query.exception;

import jakarta.servlet.http.HttpServletRequest;
import java.time.Instant;
import java.util.List;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.dao.DataAccessException;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.dao.OptimisticLockingFailureException;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.MissingServletRequestParameterException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.method.annotation.MethodArgumentTypeMismatchException;
import org.springframework.web.multipart.MaxUploadSizeExceededException;
import org.springframework.web.multipart.support.MissingServletRequestPartException;

/**
 * Global exception handler for standardized error reporting across the service.
 */
@RestControllerAdvice
public class GlobalExceptionHandler {

    private static final Logger log = LoggerFactory.getLogger(GlobalExceptionHandler.class);

    /**
     * Handles a request parameter that could not be converted, most often a malformed ISO-8601
     * instant in {@code from}/{@code to}.
     */
    @ExceptionHandler(MethodArgumentTypeMismatchException.class)
    public ResponseEntity<ErrorResponse> handleTypeMismatch(
            MethodArgumentTypeMismatchException ex, HttpServletRequest request) {

        ErrorResponse response = badRequest(
                request,
                "Parameter '" + ex.getName() + "' has an unsupported value.",
                List.of(new ErrorResponse.ValidationError(ex.getName(), describeExpectedType(ex))));

        log.warn("Unconvertible parameter '{}' at {}", ex.getName(), request.getRequestURI());
        return ResponseEntity.badRequest().body(response);
    }

    /**
     * Handles a missing mandatory request parameter, such as the device/metric pair the series
     * endpoint needs.
     */
    @ExceptionHandler(MissingServletRequestParameterException.class)
    public ResponseEntity<ErrorResponse> handleMissingParameter(
            MissingServletRequestParameterException ex, HttpServletRequest request) {

        ErrorResponse response = badRequest(
                request,
                "Required parameter '" + ex.getParameterName() + "' is missing.",
                List.of(new ErrorResponse.ValidationError(ex.getParameterName(), "must be provided")));

        log.warn("Missing parameter '{}' at {}", ex.getParameterName(), request.getRequestURI());
        return ResponseEntity.badRequest().body(response);
    }

    /**
     * Handles rejected query arguments, such as an unsupported sort field or an inverted time window.
     */
    @ExceptionHandler(IllegalArgumentException.class)
    public ResponseEntity<ErrorResponse> handleIllegalArgument(
            IllegalArgumentException ex, HttpServletRequest request) {

        ErrorResponse response = badRequest(request, ex.getMessage(), List.of());

        log.warn("Rejected query at {}: {}", request.getRequestURI(), ex.getMessage());
        return ResponseEntity.badRequest().body(response);
    }

    /**
     * Handles the read store being unreachable or failing, which is an availability problem rather
     * than a caller error.
     */
    @ExceptionHandler(DataAccessException.class)
    public ResponseEntity<ErrorResponse> handleDataAccessException(
            DataAccessException ex, HttpServletRequest request) {

        ErrorResponse response = new ErrorResponse(
                Instant.now(),
                HttpStatus.SERVICE_UNAVAILABLE.value(),
                "Service Unavailable",
                "Telemetry store is currently unavailable.",
                request.getRequestURI(),
                List.of());

        log.warn("Telemetry store failure while processing request to {}", request.getRequestURI(), ex);
        return ResponseEntity.status(HttpStatus.SERVICE_UNAVAILABLE).body(response);
    }

    /** Handles a request body that failed bean validation, such as a too-short password. */
    @ExceptionHandler(MethodArgumentNotValidException.class)
    public ResponseEntity<ErrorResponse> handleInvalidBody(
            MethodArgumentNotValidException ex, HttpServletRequest request) {

        List<ErrorResponse.ValidationError> errors = ex.getBindingResult().getFieldErrors().stream()
                .map(error -> new ErrorResponse.ValidationError(error.getField(), error.getDefaultMessage()))
                .toList();
        return ResponseEntity.badRequest().body(badRequest(request, "Some fields are invalid.", errors));
    }

    @ExceptionHandler({HttpMessageNotReadableException.class, MissingServletRequestPartException.class})
    public ResponseEntity<ErrorResponse> handleUnreadableBody(Exception ex, HttpServletRequest request) {
        return ResponseEntity.badRequest().body(badRequest(request, "The request body is missing or malformed.", List.of()));
    }

    @ExceptionHandler(AuthExceptions.UnauthorizedException.class)
    public ResponseEntity<ErrorResponse> handleUnauthorized(RuntimeException ex, HttpServletRequest request) {
        return status(HttpStatus.UNAUTHORIZED, ex.getMessage(), request);
    }

    @ExceptionHandler(AuthExceptions.ForbiddenException.class)
    public ResponseEntity<ErrorResponse> handleForbidden(RuntimeException ex, HttpServletRequest request) {
        return status(HttpStatus.FORBIDDEN, ex.getMessage(), request);
    }

    @ExceptionHandler(AuthExceptions.ConflictException.class)
    public ResponseEntity<ErrorResponse> handleConflict(RuntimeException ex, HttpServletRequest request) {
        return status(HttpStatus.CONFLICT, ex.getMessage(), request);
    }

    @ExceptionHandler(ResourceExceptions.NotFoundException.class)
    public ResponseEntity<ErrorResponse> handleNotFound(RuntimeException ex, HttpServletRequest request) {
        return status(HttpStatus.NOT_FOUND, ex.getMessage(), request);
    }

    @ExceptionHandler(ResourceExceptions.StateConflictException.class)
    public ResponseEntity<ErrorResponse> handleStateConflict(RuntimeException ex, HttpServletRequest request) {
        return status(HttpStatus.CONFLICT, ex.getMessage(), request);
    }

    /**
     * The incident changed between reading and writing it — most often the processor folded in a new
     * anomaly. It is a 409 the caller can retry after reloading, not a store outage.
     */
    @ExceptionHandler(OptimisticLockingFailureException.class)
    public ResponseEntity<ErrorResponse> handleConcurrentChange(
            OptimisticLockingFailureException ex, HttpServletRequest request) {
        log.info("Concurrent change at {}: {}", request.getRequestURI(), ex.getMessage());
        return status(HttpStatus.CONFLICT, "This incident changed while you were working on it. Reload and try again.", request);
    }

    /** Two sign-ups racing for the same username: the unique constraint wins, and it is still a 409. */
    @ExceptionHandler(DataIntegrityViolationException.class)
    public ResponseEntity<ErrorResponse> handleIntegrityViolation(
            DataIntegrityViolationException ex, HttpServletRequest request) {
        log.warn("Integrity violation at {}: {}", request.getRequestURI(), ex.getMostSpecificCause().getMessage());
        return status(HttpStatus.CONFLICT, "This value is already in use.", request);
    }

    @ExceptionHandler(AuthExceptions.InvalidAvatarException.class)
    public ResponseEntity<ErrorResponse> handleInvalidAvatar(
            AuthExceptions.InvalidAvatarException ex, HttpServletRequest request) {
        return status(ex.isTooLarge() ? HttpStatus.PAYLOAD_TOO_LARGE : HttpStatus.BAD_REQUEST, ex.getMessage(), request);
    }

    @ExceptionHandler(MaxUploadSizeExceededException.class)
    public ResponseEntity<ErrorResponse> handleUploadTooLarge(
            MaxUploadSizeExceededException ex, HttpServletRequest request) {
        return status(HttpStatus.PAYLOAD_TOO_LARGE, "The photo is too large.", request);
    }

    /**
     * Catch-all handler for any other unhandled exceptions.
     */
    @ExceptionHandler(Exception.class)
    public ResponseEntity<ErrorResponse> handleGenericException(Exception ex, HttpServletRequest request) {

        log.error("Unhandled exception occurred while processing request to {}", request.getRequestURI(), ex);

        ErrorResponse response = new ErrorResponse(
                Instant.now(),
                HttpStatus.INTERNAL_SERVER_ERROR.value(),
                "Internal Server Error",
                "An unexpected error occurred. Please contact system administrator.",
                request.getRequestURI(),
                List.of());

        return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).body(response);
    }

    private static ResponseEntity<ErrorResponse> status(HttpStatus status, String message, HttpServletRequest request) {
        return ResponseEntity.status(status).body(new ErrorResponse(
                Instant.now(), status.value(), status.getReasonPhrase(), message, request.getRequestURI(), List.of()));
    }

    private static ErrorResponse badRequest(
            HttpServletRequest request, String message, List<ErrorResponse.ValidationError> errors) {

        return new ErrorResponse(
                Instant.now(),
                HttpStatus.BAD_REQUEST.value(),
                "Bad Request",
                message,
                request.getRequestURI(),
                errors);
    }

    private static String describeExpectedType(MethodArgumentTypeMismatchException ex) {
        Class<?> requiredType = ex.getRequiredType();
        if (requiredType == java.time.Instant.class) {
            return "must be an ISO-8601 instant, for example 2026-09-08T10:15:30Z";
        }
        return requiredType == null
                ? "has an unsupported value"
                : "must be a valid " + requiredType.getSimpleName();
    }
}
