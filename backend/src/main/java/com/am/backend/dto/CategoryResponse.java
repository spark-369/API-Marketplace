package com.am.backend.dto;

import com.am.backend.model.Category;

import java.time.LocalDateTime;
import java.util.UUID;

/**
 * Read model for a category.
 *
 * @param apiCount number of APIs assigned to this category
 */
public record CategoryResponse(
        UUID id,
        String name,
        String description,
        long apiCount,
        LocalDateTime createdAt,
        LocalDateTime updatedAt
) {

    public static CategoryResponse from(Category category, long apiCount) {
        return new CategoryResponse(
                category.getId(),
                category.getName(),
                category.getDescription(),
                apiCount,
                category.getCreatedAt(),
                category.getUpdatedAt()
        );
    }

    public static CategoryResponse from(Category category) {
        return from(category, 0L);
    }
}
