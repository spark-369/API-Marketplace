package com.am.backend.dto;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

import java.math.BigDecimal;

/**
 * Payload for creating or updating a plan ({@code POST/PUT /api/apis/{apiId}/plans}).
 */
public record PlanRequest(

        @NotBlank(message = "Name is required")
        @Size(max = 120, message = "Name must be at most 120 characters")
        String name,

        @Size(max = 1000, message = "Description must be at most 1000 characters")
        String description,

        @Min(value = 0, message = "Price cannot be negative")
        BigDecimal price,

        @Min(value = 1, message = "Rate limit must be greater than zero")
        @Max(value = 1_000_000, message = "Rate limit is unreasonably large")
        Integer rateLimit,

        @Pattern(regexp = "SECOND|MINUTE|HOUR|DAY|MONTH", message = "Invalid rate period")
        String ratePeriod,

        @Size(max = 40, message = "Support level must be at most 40 characters")
        String supportLevel
) {
}
