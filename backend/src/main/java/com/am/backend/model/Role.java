package com.am.backend.model;

/**
 * Authorization role attached to a {@link User}.
 */
public enum Role {

    /** Platform governance: users, categories, and every API/plan/key/subscription/review. */
    ADMIN,

    /** Publishes and manages APIs, their plans, and the API-key pool. CRUD-only, cannot consume. */
    PROVIDER,

    /** Discovers, subscribes to, reviews and consumes APIs through the gateway. */
    DEVELOPER
}
