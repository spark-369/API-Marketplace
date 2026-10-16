package com.am.backend.ratelimit;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Unit tests for the rate-limit decision value object.
 *
 * <p>The retry-after floor deserves an explicit test: a zero or negative value would produce a
 * {@code Retry-After: 0} header, which well-behaved clients interpret as "retry immediately" and
 * turn into a hot loop against a service that is already at capacity.</p>
 */
class RateLimitDecisionTest {

    @Test
    @DisplayName("allowed() reports permission with no retry guidance")
    void allowedCarriesLimitAndWindow() {
        RateLimitDecision decision = RateLimitDecision.allowed(100, 60);

        assertThat(decision.allowed()).isTrue();
        assertThat(decision.limit()).isEqualTo(100);
        assertThat(decision.windowSeconds()).isEqualTo(60);
        assertThat(decision.retryAfterSeconds()).isZero();
    }

    @Test
    @DisplayName("denied() reports rejection with a positive retry-after")
    void deniedCarriesRetryAfter() {
        RateLimitDecision decision = RateLimitDecision.denied(50, 3600, 900);

        assertThat(decision.allowed()).isFalse();
        assertThat(decision.limit()).isEqualTo(50);
        assertThat(decision.windowSeconds()).isEqualTo(3600);
        assertThat(decision.retryAfterSeconds()).isEqualTo(900);
    }

    @Test
    @DisplayName("denied() floors retry-after at one second")
    void deniedFloorsRetryAfterToAtLeastOneSecond() {
        assertThat(RateLimitDecision.denied(10, 60, 0).retryAfterSeconds()).isEqualTo(1);
        assertThat(RateLimitDecision.denied(10, 60, -5).retryAfterSeconds()).isEqualTo(1);
    }
}
