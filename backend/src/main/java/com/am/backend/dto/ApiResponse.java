package com.am.backend.dto;

import com.am.backend.model.Api;
import com.am.backend.model.ApiStatus;
import com.am.backend.model.ApiVisibility;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.UUID;

/**
 * Read model for an API. Includes a flattened owner summary and optional category summary so
 * the SPA never has to dereference lazy associations.
 *
 * <p><strong>Cache contract.</strong> This record is deliberately principal-independent: it carries
 * no per-caller flags. That is what makes it safe to store in the {@code apiCatalog} cache, but it
 * also means an instance must never be produced for a caller who is not entitled to see the API —
 * visibility is enforced before construction, never encoded in the payload. See
 * {@code PublicApiCacheReader}.</p>
 *
 * @param ownerName convenience display field ({@code firstName lastName})
 */
public record ApiResponse(
        UUID id,
        String name,
        String slug,
        String description,
        String baseUrl,
        String documentationUrl,
        ApiStatus status,
        ApiVisibility visibility,
        String version,
        BigDecimal averageRating,
        long reviewCount,
        UUID categoryId,
        String categoryName,
        UUID ownerId,
        String ownerName,
        String ownerEmail,
        LocalDateTime createdAt,
        LocalDateTime updatedAt
) {

    /**
     * Flattens an {@link Api} entity into a response.
     *
     * <p>Must be called inside a transaction (or with associations already initialised) because
     * {@code open-in-view} is disabled.</p>
     */
    public static ApiResponse from(Api api) {
        return new ApiResponse(
                api.getId(),
                api.getName(),
                api.getSlug(),
                api.getDescription(),
                api.getBaseUrl(),
                api.getDocumentationUrl(),
                api.getStatus(),
                api.getVisibility(),
                api.getVersion(),
                api.getAverageRating(),
                api.getReviewCount(),
                api.getCategory() == null ? null : api.getCategory().getId(),
                api.getCategory() == null ? null : api.getCategory().getName(),
                api.getOwner().getId(),
                api.getOwner().getFullName(),
                api.getOwner().getEmail(),
                api.getCreatedAt(),
                api.getUpdatedAt()
        );
    }
}
