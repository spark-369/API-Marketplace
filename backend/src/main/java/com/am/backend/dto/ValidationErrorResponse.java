package com.am.backend.dto;

import com.fasterxml.jackson.annotation.JsonInclude;

import java.time.LocalDateTime;
import java.util.Map;

/**
 * Error envelope for Bean Validation failures, carrying a {@code field -> message} map.
 */
@JsonInclude(JsonInclude.Include.ALWAYS)
public record ValidationErrorResponse(
        LocalDateTime timestamp,
        int status,
        String message,
        Map<String, String> errors
) {

    public static ValidationErrorResponse of(Map<String, String> errors) {
        return new ValidationErrorResponse(
                LocalDateTime.now(),
                400,
                "Validation failed",
                errors
        );
    }
}
