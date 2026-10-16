package com.am.backend.dto;

import com.am.backend.model.Subscription;
import com.am.backend.model.SubscriptionStatus;

import java.time.LocalDateTime;
import java.util.UUID;

/**
 * Read model for a subscription, including the delegated key's display prefix (never the secret).
 */
public record SubscriptionResponse(
        UUID id,
        SubscriptionStatus status,
        LocalDateTime startedAt,
        LocalDateTime expiresAt,
        LocalDateTime cancelledAt,
        UUID userId,
        String userEmail,
        UUID apiId,
        String apiName,
        UUID planId,
        String planName,
        UUID apiKeyId,
        String apiKeyPrefix,
        LocalDateTime createdAt
) {

    public static SubscriptionResponse from(Subscription subscription, com.am.backend.model.ApiKey key) {
        return new SubscriptionResponse(
                subscription.getId(),
                subscription.getStatus(),
                subscription.getStartedAt(),
                subscription.getExpiresAt(),
                subscription.getCancelledAt(),
                subscription.getUser().getId(),
                subscription.getUser().getEmail(),
                subscription.getApi().getId(),
                subscription.getApi().getName(),
                subscription.getPlan() == null ? null : subscription.getPlan().getId(),
                subscription.getPlan() == null ? null : subscription.getPlan().getName(),
                key == null ? null : key.getId(),
                key == null ? null : key.getKeyPrefix(),
                subscription.getCreatedAt()
        );
    }

    public static SubscriptionResponse from(Subscription subscription) {
        return from(subscription, null);
    }
}
