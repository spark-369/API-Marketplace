package com.am.backend.model;

/**
 * Discoverability of an {@link Api}.
 */
public enum ApiVisibility {

    /** Listed in the public catalog when the API is also {@link ApiStatus#PUBLISHED}. */
    PUBLIC,

    /** Hidden from the public catalog; direct access is masked as 404. */
    PRIVATE
}
