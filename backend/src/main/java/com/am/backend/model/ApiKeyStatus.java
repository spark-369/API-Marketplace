package com.am.backend.model;

/**
 * Lifecycle of an {@link ApiKey}.
 */
public enum ApiKeyStatus {

    /** Usable for gateway authentication. */
    ACTIVE,

    /** Manually revoked by a provider or admin. Terminal. */
    REVOKED,

    /** Passed its {@code expiresAt} instant. Terminal. */
    EXPIRED
}
