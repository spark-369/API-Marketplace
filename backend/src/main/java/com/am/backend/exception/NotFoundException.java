package com.am.backend.exception;

/**
 * Thrown when a requested resource does not exist or must be masked from the caller.
 *
 * <p>Note: resources the caller may not view are deliberately reported as 404 (not 403)
 * so that the API surface does not leak the existence of private resources.</p>
 */
public class NotFoundException extends RuntimeException {

    public NotFoundException(String message) {
        super(message);
    }

    public static NotFoundException of(String resource, Object id) {
        return new NotFoundException(resource + " not found");
    }
}
