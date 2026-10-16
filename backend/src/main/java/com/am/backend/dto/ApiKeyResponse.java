package com.am.backend.dto;

import com.am.backend.model.ApiKey;
import com.am.backend.model.ApiKeyStatus;

import java.time.LocalDateTime;
import java.util.UUID;

/**
 * Read model for an API key.
 *
 * <p>The plaintext secret is never included here. {@link ApiKeyCreatedResponse} carries it once,
 * at creation time, and never again.</p>
 */
public record ApiKeyResponse(
        UUID id,
        String keyPrefix,
        String name,
        ApiKeyStatus status,
        LocalDateTime expiresAt,
        LocalDateTime lastUsedAt,
        UUID apiId,
        String apiName,
        UUID planId,
        String planName,
        UUID userId,
        String userEmail,
        boolean pooled,
        LocalDateTime createdAt
) {

    public static ApiKeyResponse from(ApiKey key) {
        return new ApiKeyResponse(
                key.getId(),
                key.getKeyPrefix(),
                key.getName(),
                key.getStatus(),
                key.getExpiresAt(),
                key.getLastUsedAt(),
                key.getApi().getId(),
                key.getApi().getName(),
                key.getPlan() == null ? null : key.getPlan().getId(),
                key.getPlan() == null ? null : key.getPlan().getName(),
                key.getUser() == null ? null : key.getUser().getId(),
                key.getUser() == null ? null : key.getUser().getEmail(),
                key.isPooled(),
                key.getCreatedAt()
        );
    }
}
