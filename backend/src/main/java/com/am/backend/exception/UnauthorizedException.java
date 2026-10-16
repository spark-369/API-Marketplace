package com.am.backend.exception;

/**
 * Thrown when the caller must be authenticated but the request carries no usable credentials.
 */
public class UnauthorizedException extends RuntimeException {

    public UnauthorizedException(String message) {
        super(message);
    }
}
