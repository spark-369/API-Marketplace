package com.am.backend.dto;

import com.am.backend.model.ApiKey;

/**
 * Response for key creation and rotation.
 *
 * <p><strong>This is the only payload in the system that carries {@code plaintextKey}.</strong>
 * Callers must persist it immediately; it cannot be retrieved again.</p>
 */
public record ApiKeyCreatedResponse(
        ApiKeyResponse key,
        String plaintextKey,
        String warning
) {

    private static final String WARNING =
            "Store this key securely. It cannot be retrieved again; only a hash is persisted.";

    public static ApiKeyCreatedResponse from(ApiKey key, String plaintext) {
        return new ApiKeyCreatedResponse(ApiKeyResponse.from(key), plaintext, WARNING);
    }
}
