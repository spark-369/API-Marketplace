package com.am.backend.dto;

import jakarta.validation.constraints.Future;

import java.time.LocalDateTime;

/**
 * Payload for updating a subscription ({@code PUT .../subscriptions/{id}}).
 */
public record SubscriptionRequest(

        /** Optional new plan. Must belong to the same API. */
        java.util.UUID planId,

        @Future(message = "Expiry must be in the future")
        LocalDateTime expiresAt,

        /** Optional explicit status change; providers/admins only. */
        String status
) {
}
