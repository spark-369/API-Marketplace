package com.am.backend.dto;

import com.fasterxml.jackson.annotation.JsonInclude;

import java.time.LocalDateTime;

/**
 * Uniform JSON error envelope returned by {@code GlobalExceptionHandler}.
 *
 * @param timestamp instant the error was rendered
 * @param status    HTTP status code
 * @param message   human-readable, safe-to-expose message
 * @param errors    optional field-level validation errors, {@code null} otherwise
 */
@JsonInclude(JsonInclude.Include.ALWAYS)
public record ErrorResponse(
        LocalDateTime timestamp,
        int status,
        String message,
        Object errors
) {

    public static ErrorResponse of(int status, String message) {
        return new ErrorResponse(LocalDateTime.now(), status, message, null);
    }

    public static ErrorResponse of(int status, String message, Object errors) {
        return new ErrorResponse(LocalDateTime.now(), status, message, errors);
    }
}
