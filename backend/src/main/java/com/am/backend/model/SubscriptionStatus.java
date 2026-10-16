package com.am.backend.model;

/**
 * Lifecycle of a {@link Subscription}.
 */
public enum SubscriptionStatus {

    /** Currently entitled; the assigned API key is usable. */
    ACTIVE,

    /** Cancelled by the subscriber or an admin; the delegated key returned to the pool. */
    CANCELLED,

    /** Past its {@code expiresAt} instant. */
    EXPIRED
}
