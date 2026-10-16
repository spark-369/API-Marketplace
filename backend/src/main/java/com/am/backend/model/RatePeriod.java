package com.am.backend.model;

import java.time.Duration;

/**
 * Window over which a {@link Plan} quota is enforced.
 */
public enum RatePeriod {

    SECOND(Duration.ofSeconds(1)),
    MINUTE(Duration.ofMinutes(1)),
    HOUR(Duration.ofHours(1)),
    DAY(Duration.ofDays(1)),
    MONTH(Duration.ofDays(30));

    private final Duration duration;

    RatePeriod(Duration duration) {
        this.duration = duration;
    }

    public Duration duration() {
        return duration;
    }

    /**
     * Number of seconds in this window; used as the Redis counter TTL.
     */
    public long seconds() {
        return duration.getSeconds();
    }
}
