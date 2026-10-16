package com.am.backend.dto;

import com.am.backend.model.Review;

import java.time.LocalDateTime;
import java.util.UUID;

/**
 * Read model for a review.
 *
 * @param authorName convenience display field for the reviewer
 */
public record ReviewResponse(
        UUID id,
        int rating,
        String title,
        String comment,
        UUID apiId,
        String apiName,
        UUID userId,
        String authorName,
        LocalDateTime createdAt,
        LocalDateTime updatedAt
) {

    public static ReviewResponse from(Review review) {
        return new ReviewResponse(
                review.getId(),
                review.getRating(),
                review.getTitle(),
                review.getComment(),
                review.getApi().getId(),
                review.getApi().getName(),
                review.getUser().getId(),
                review.getUser().getFullName(),
                review.getCreatedAt(),
                review.getUpdatedAt()
        );
    }
}
