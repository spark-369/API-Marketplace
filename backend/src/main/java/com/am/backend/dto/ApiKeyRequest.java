package com.am.backend.dto;

import jakarta.validation.constraints.Size;

import java.time.LocalDateTime;

/**
 * Payload for provisioning a key into a provider's pool
 * ({@code POST /api/apis/{apiId}/keys}).
 */
public record ApiKeyRequest(

        @Size(max = 120, message = "Name must be at most 120 characters")
        String name,

        /** Optional plan binding; must belong to the target API when supplied. */
        java.util.UUID planId,

        LocalDateTime expiresAt
) {
}
