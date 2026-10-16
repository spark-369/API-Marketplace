package com.am.backend.exception;

/**
 * Thrown when a request conflicts with existing state (duplicate unique field, resource still
 * referenced by dependants, exhausted API-key pool).
 */
public class ConflictException extends RuntimeException {

    public ConflictException(String message) {
        super(message);
    }
}
