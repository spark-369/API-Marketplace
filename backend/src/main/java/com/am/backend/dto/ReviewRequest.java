package com.am.backend.dto;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

/**
 * Payload for creating or updating a review ({@code POST/PUT /api/apis/{apiId}/reviews}).
 */
public record ReviewRequest(

        @NotNull(message = "Rating is required")
        @Min(value = 1, message = "Rating must be between 1 and 5")
        @Max(value = 5, message = "Rating must be between 1 and 5")
        Integer rating,

        @Size(max = 200, message = "Title must be at most 200 characters")
        String title,

        @Size(max = 4000, message = "Comment must be at most 4000 characters")
        String comment
) {
}
