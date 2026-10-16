package com.am.backend.model;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;

import java.math.BigDecimal;
import java.time.LocalDateTime;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Unit tests for the domain rules embedded in the entity model.
 *
 * <p>These rules are load-bearing for security and billing decisions that the gateway makes on every
 * request, so they are pinned here rather than only exercised through integration flows.</p>
 */
class DomainRulesTest {

    @Nested
    @DisplayName("Api.isPubliclyVisible()")
    class Visibility {

        @Test
        void publishedPublicApiIsVisible() {
            assertThat(api(ApiStatus.PUBLISHED, ApiVisibility.PUBLIC).isPubliclyVisible()).isTrue();
        }

        @Test
        void publishedPrivateApiIsHidden() {
            assertThat(api(ApiStatus.PUBLISHED, ApiVisibility.PRIVATE).isPubliclyVisible()).isFalse();
        }

        @Test
        void draftIsNeverVisibleEvenWhenMarkedPublic() {
            assertThat(api(ApiStatus.DRAFT, ApiVisibility.PUBLIC).isPubliclyVisible()).isFalse();
        }

        @Test
        void archivedIsNeverVisible() {
            assertThat(api(ApiStatus.ARCHIVED, ApiVisibility.PUBLIC).isPubliclyVisible()).isFalse();
        }

        private Api api(ApiStatus status, ApiVisibility visibility) {
            Api api = new Api();
            api.setStatus(status);
            api.setVisibility(visibility);
            return api;
        }
    }

    @Nested
    @DisplayName("ApiKey.isUsable()")
    class KeyUsability {

        @Test
        void activeUnexpiredKeyIsUsable() {
            assertThat(key(ApiKeyStatus.ACTIVE, null).isUsable()).isTrue();
            assertThat(key(ApiKeyStatus.ACTIVE, LocalDateTime.now().plusDays(1)).isUsable()).isTrue();
        }

        @Test
        void revokedKeyIsNotUsableEvenWhenUnexpired() {
            assertThat(key(ApiKeyStatus.REVOKED, LocalDateTime.now().plusDays(1)).isUsable()).isFalse();
        }

        @Test
        void keyPastExpiryIsRejectedEvenIfStatusSweepHasNotRunYet() {
            // The gateway depends on this: a key whose status column still says ACTIVE must be
            // rejected once its expiry instant has passed.
            assertThat(key(ApiKeyStatus.ACTIVE, LocalDateTime.now().minusMinutes(1)).isUsable()).isFalse();
        }

        @Test
        void pooledKeyIsRecognisedWhileUnassigned() {
            ApiKey unassigned = key(ApiKeyStatus.ACTIVE, null);
            assertThat(unassigned.isPooled()).isTrue();

            unassigned.setUser(new User());
            assertThat(unassigned.isPooled()).isFalse();
        }

        private ApiKey key(ApiKeyStatus status, LocalDateTime expiresAt) {
            ApiKey key = new ApiKey();
            key.setStatus(status);
            key.setExpiresAt(expiresAt);
            return key;
        }
    }

    @Nested
    @DisplayName("Subscription.isLive()")
    class SubscriptionLiveness {

        @Test
        void activeWithoutExpiryIsLive() {
            Subscription subscription = new Subscription();
            subscription.setStatus(SubscriptionStatus.ACTIVE);
            subscription.setStartedAt(LocalDateTime.now());

            assertThat(subscription.isLive()).isTrue();
        }

        @Test
        void activeButPastExpiryIsNotLive() {
            Subscription subscription = new Subscription();
            subscription.setStatus(SubscriptionStatus.ACTIVE);
            subscription.setExpiresAt(LocalDateTime.now().minusHours(1));

            assertThat(subscription.isLive()).isFalse();
        }

        @Test
        void cancelledIsNeverLive() {
            Subscription subscription = new Subscription();
            subscription.setStatus(SubscriptionStatus.CANCELLED);
            subscription.setExpiresAt(LocalDateTime.now().plusDays(30));

            assertThat(subscription.isLive()).isFalse();
        }
    }

    @Nested
    @DisplayName("Plan.isFree()")
    class PlanPricing {

        @Test
        void zeroPriceIsFree() {
            Plan plan = new Plan();
            plan.setPrice(BigDecimal.ZERO);
            assertThat(plan.isFree()).isTrue();
        }

        @Test
        void nullPriceIsTreatedAsFree() {
            Plan plan = new Plan();
            plan.setPrice(null);
            assertThat(plan.isFree()).isTrue();
        }

        @Test
        void positivePriceIsNotFree() {
            Plan plan = new Plan();
            plan.setPrice(new BigDecimal("49.99"));
            assertThat(plan.isFree()).isFalse();
        }
    }

    @Nested
    @DisplayName("RatePeriod")
    class RatePeriods {

        @Test
        void exposesWindowLengthInSeconds() {
            assertThat(RatePeriod.SECOND.seconds()).isEqualTo(1);
            assertThat(RatePeriod.MINUTE.seconds()).isEqualTo(60);
            assertThat(RatePeriod.HOUR.seconds()).isEqualTo(3600);
            assertThat(RatePeriod.DAY.seconds()).isEqualTo(86400);
        }

        @Test
        void monthIsThirtyDaysForQuotaPurposes() {
            assertThat(RatePeriod.MONTH.seconds()).isEqualTo(30L * 24 * 3600);
        }
    }
}
