package com.am.backend.dto;

import jakarta.validation.constraints.Size;

/**
 * Payload for admin rotation of an existing key
 * ({@code POST /api/apis/{apiId}/keys/{keyId}/rotate}).
 */
public record RotateApiKeyRequest(

        /** Optional caller-supplied replacement secret. Generated when blank. */
        @Size(min = 24, max = 200, message = "Replacement key must be between 24 and 200 characters")
        String replacementKey,

        @Size(max = 120, message = "Name must be at most 120 characters")
        String name
) {
}
