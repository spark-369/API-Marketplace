package com.am.backend.model;

/**
 * Publication lifecycle of an {@link Api}.
 */
public enum ApiStatus {

    /** Work in progress. Never publicly listable. */
    DRAFT,

    /** Live. Publicly listable when visibility is not {@link ApiVisibility#PRIVATE}. */
    PUBLISHED,

    /** Retired. Hidden from all public listings. */
    ARCHIVED
}
