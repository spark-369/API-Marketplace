package com.am.backend.exception;

/**
 * Thrown for semantically invalid requests that Bean Validation cannot express.
 */
public class BadRequestException extends RuntimeException {

    public BadRequestException(String message) {
        super(message);
    }
}
