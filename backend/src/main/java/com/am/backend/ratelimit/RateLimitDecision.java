package com.am.backend.ratelimit;

/**
 * Outcome of a rate-limit check.
 *
 * @param allowed           whether the request may proceed
 * @param limit             configured ceiling for the window
 * @param windowSeconds     length of the fixed window
 * @param retryAfterSeconds seconds the caller should wait; only meaningful when denied
 */
public record RateLimitDecision(
        boolean allowed,
        int limit,
        long windowSeconds,
        long retryAfterSeconds
) {

    public static RateLimitDecision allowed(int limit, long windowSeconds) {
        return new RateLimitDecision(true, limit, windowSeconds, 0L);
    }

    public static RateLimitDecision denied(int limit, long windowSeconds, long retryAfterSeconds) {
        return new RateLimitDecision(false, limit, windowSeconds, Math.max(1L, retryAfterSeconds));
    }
}
