package com.am.backend.exception;

/**
 * Thrown when an authenticated caller lacks the role or ownership required for an action.
 */
public class ForbiddenException extends RuntimeException {

    public ForbiddenException(String message) {
        super(message);
    }
}
