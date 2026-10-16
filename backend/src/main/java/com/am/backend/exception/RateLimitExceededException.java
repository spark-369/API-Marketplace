package com.am.backend.exception;

/**
 * Thrown by the rate limiter when an API key exceeds its plan quota.
 *
 * <p>Carries {@link #getRetryAfterSeconds()} so the handler can emit a {@code Retry-After}
 * response header.</p>
 */
public class RateLimitExceededException extends RuntimeException {

    private final long retryAfterSeconds;
    private final int limit;
    private final long windowSeconds;

    public RateLimitExceededException(String message, long retryAfterSeconds, int limit, long windowSeconds) {
        super(message);
        this.retryAfterSeconds = retryAfterSeconds;
        this.limit = limit;
        this.windowSeconds = windowSeconds;
    }

    public RateLimitExceededException(String message) {
        this(message, 60L, 0, 60L);
    }

    public long getRetryAfterSeconds() {
        return retryAfterSeconds;
    }

    public int getLimit() {
        return limit;
    }

    public long getWindowSeconds() {
        return windowSeconds;
    }
}
