package com.am.backend.service;

import com.am.backend.cache.CacheNames;
import com.am.backend.dto.PageResponse;
import com.am.backend.dto.SubscriptionRequest;
import com.am.backend.dto.SubscriptionResponse;
import com.am.backend.exception.ConflictException;
import com.am.backend.exception.NotFoundException;
import com.am.backend.model.Api;
import com.am.backend.model.ApiKey;
import com.am.backend.model.Plan;
import com.am.backend.model.Subscription;
import com.am.backend.model.SubscriptionStatus;
import com.am.backend.model.User;
import com.am.backend.repository.SubscriptionRepository;
import com.am.backend.security.SecurityUtils;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.cache.annotation.CacheEvict;
import org.springframework.cache.annotation.Caching;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.List;
import java.util.UUID;

import static org.springframework.util.StringUtils.hasText;

/**
 * Subscriptions: the join between a developer's entitlement and a concrete API-key credential.
 *
 * <p>Subscribing is a three-step transaction — validate the plan belongs to the API, confirm there
 * is no existing subscription, then delegate a pooled key. Cancelling reverses the key delegation
 * while leaving usage history intact.</p>
 */
@Service
public class SubscriptionService {

    private static final Logger log = LoggerFactory.getLogger(SubscriptionService.class);

    private final SubscriptionRepository subscriptionRepository;
    private final ApiKeyService apiKeyService;
    private final PlanService planService;
    private final ApiService apiService;

    public SubscriptionService(SubscriptionRepository subscriptionRepository,
                               ApiKeyService apiKeyService,
                               PlanService planService,
                               ApiService apiService) {
        this.subscriptionRepository = subscriptionRepository;
        this.apiKeyService = apiKeyService;
        this.planService = planService;
        this.apiService = apiService;
    }

    // ---- Reads -------------------------------------------------------------

    /**
     * The caller's subscription to a specific API, if any.
     */
    @Transactional(readOnly = true)
    public SubscriptionResponse getMySubscription(UUID apiId) {
        UUID userId = SecurityUtils.requireCurrentUserId();
        Subscription subscription = subscriptionRepository.findByUserIdAndApiId(userId, apiId)
                .orElseThrow(() -> new NotFoundException("You are not subscribed to this API"));
        return toResponse(subscription, apiId, userId);
    }

    /**
     * Every subscription belonging to the caller, across all APIs.
     */
    @Transactional(readOnly = true)
    public List<SubscriptionResponse> listMySubscriptions() {
        UUID userId = SecurityUtils.requireCurrentUserId();
        return subscriptionRepository.findByUserId(userId).stream()
                .map(subscription -> toResponse(subscription, subscription.getApi().getId(), userId))
                .toList();
    }

    /**
     * Provider view: all subscriptions to an API the caller owns.
     */
    @Transactional(readOnly = true)
    public PageResponse<SubscriptionResponse> listSubscriptionsForApi(UUID apiId, Pageable pageable) {
        apiService.requireManageableApi(apiId);
        return PageResponse.from(subscriptionRepository.findByApiId(apiId, pageable),
                subscription -> toResponse(subscription, apiId, subscription.getUser().getId()));
    }

    /**
     * Administrative listing across the platform.
     */
    @Transactional(readOnly = true)
    public PageResponse<SubscriptionResponse> listAllSubscriptions(Pageable pageable) {
        return PageResponse.from(subscriptionRepository.findAll(pageable),
                subscription -> toResponse(subscription, subscription.getApi().getId(),
                        subscription.getUser().getId()));
    }

    // ---- Subscribe / cancel ------------------------------------------------

    /**
     * Subscribes the caller to an API and delegates a key from the provider's pool.
     *
     * <p>Guards: the plan (when supplied) must belong to the API, and the caller must not already be
     * subscribed. Providers are excluded from consuming APIs at the controller layer.</p>
     *
     * @throws ConflictException when the caller already subscribes, or the key pool is empty
     */
    @Transactional
    @Caching(evict = {
            @CacheEvict(cacheNames = CacheNames.KEY_VALIDATION, allEntries = true),
            @CacheEvict(cacheNames = CacheNames.USAGE_STATS, allEntries = true)
    })
    public SubscriptionResponse subscribe(UUID apiId, UUID planId) {
        Api api = apiService.requireApi(apiId);
        User subscriber = SecurityUtils.requireCurrentUser();

        if (subscriptionRepository.findByUserIdAndApiId(subscriber.getId(), apiId).isPresent()) {
            throw new ConflictException("You are already subscribed to this API");
        }

        Plan plan = planId == null ? null : planService.requirePlanForApi(apiId, planId);

        Subscription subscription = new Subscription();
        subscription.setUser(subscriber);
        subscription.setApi(api);
        subscription.setPlan(plan);
        subscription.setStatus(SubscriptionStatus.ACTIVE);
        subscription.setStartedAt(LocalDateTime.now());

        // Persist first so the subscription exists if key delegation fails.
        Subscription saved = subscriptionRepository.save(subscription);

        ApiKey assigned = apiKeyService.assignApiKeyForSubscription(apiId, plan, subscriber);

        log.info("User {} subscribed to API {} (plan={}, key={})",
                subscriber.getId(), apiId, planId, assigned.getId());
        return SubscriptionResponse.from(saved, assigned);
    }

    /**
     * Cancels a subscription, returning its key to the pool.
     *
     * <p>Only the subscriber (or an admin) may cancel. The subscription row is retained with status
     * {@code CANCELLED} so history and quota reporting stay intact.</p>
     */
    @Transactional
    @Caching(evict = {
            @CacheEvict(cacheNames = CacheNames.KEY_VALIDATION, allEntries = true),
            @CacheEvict(cacheNames = CacheNames.USAGE_STATS, allEntries = true)
    })
    public void cancelSubscription(UUID subscriptionId) {
        Subscription subscription = requireSubscription(subscriptionId);
        SecurityUtils.assertCanManage(subscription.getUser().getId(), "subscription");

        ApiKey assigned = apiKeyService
                .findAssignedKey(subscription.getApi().getId(), subscription.getUser().getId())
                .orElse(null);

        subscription.setStatus(SubscriptionStatus.CANCELLED);
        subscription.setCancelledAt(LocalDateTime.now());
        subscriptionRepository.save(subscription);

        if (assigned != null) {
            apiKeyService.releaseApiKeyForSubscription(assigned);
        }

        log.info("Subscription {} cancelled; key {} returned to pool",
                subscriptionId, assigned == null ? "none" : assigned.getId());
    }

    // ---- Provider / admin updates ------------------------------------------

    /**
     * Provider or admin adjustment of a subscription: change plan, extend/clear expiry, or force a
     * status. Changing the plan re-points the delegated key so the gateway enforces the new quota.
     */
    @Transactional
    @Caching(evict = {
            @CacheEvict(cacheNames = CacheNames.KEY_VALIDATION, allEntries = true),
            @CacheEvict(cacheNames = CacheNames.USAGE_STATS, allEntries = true)
    })
    public SubscriptionResponse updateSubscription(UUID subscriptionId, SubscriptionRequest request) {
        Subscription subscription = requireSubscription(subscriptionId);
        SubscriptionStatus previous = subscription.getStatus();

        if (request.planId() != null) {
            Plan plan = planService.requirePlanForApi(subscription.getApi().getId(), request.planId());
            subscription.setPlan(plan);
            apiKeyService.findAssignedKey(subscription.getApi().getId(), subscription.getUser().getId())
                    .ifPresent(key -> {
                        key.setPlan(plan);
                        log.info("Re-pointed key {} to plan {}", key.getId(), plan.getId());
                    });
        }
        if (request.expiresAt() != null) {
            subscription.setExpiresAt(request.expiresAt());
        }
        if (hasText(request.status())) {
            subscription.setStatus(SubscriptionStatus.valueOf(request.status()));
        }

        Subscription saved = subscriptionRepository.save(subscription);

        // Reinstating a cancelled subscription must re-delegate a key.
        if (previous == SubscriptionStatus.CANCELLED && saved.getStatus() == SubscriptionStatus.ACTIVE) {
            ApiKey assigned = apiKeyService.findAssignedKey(
                    saved.getApi().getId(), saved.getUser().getId()).orElse(null);
            if (assigned == null) {
                assigned = apiKeyService.assignApiKeyForSubscription(
                        saved.getApi().getId(), saved.getPlan(), saved.getUser());
            }
            return SubscriptionResponse.from(saved, assigned);
        }

        // Status changes carry no key payload in the response beyond the current binding.
        ApiKey current = apiKeyService
                .findAssignedKey(saved.getApi().getId(), saved.getUser().getId())
                .orElse(null);
        return SubscriptionResponse.from(saved, current);
    }

    // ---- Expiry sweep ------------------------------------------------------

    /**
     * Marks live subscriptions past their expiry instant as {@code EXPIRED} and releases their keys
     * back to the pool, so an expired trial cannot keep consuming quota.
     *
     * @return the number of subscriptions expired
     */
    @Transactional
    @Caching(evict = {
            @CacheEvict(cacheNames = CacheNames.KEY_VALIDATION, allEntries = true),
            @CacheEvict(cacheNames = CacheNames.USAGE_STATS, allEntries = true)
    })
    public int expireStaleSubscriptions() {
        List<Subscription> stale = subscriptionRepository.findExpiredActive(
                SubscriptionStatus.ACTIVE, LocalDateTime.now());
        if (stale.isEmpty()) {
            return 0;
        }
        for (Subscription subscription : stale) {
            subscription.setStatus(SubscriptionStatus.EXPIRED);
            apiKeyService.findAssignedKey(subscription.getApi().getId(), subscription.getUser().getId())
                    .ifPresent(apiKeyService::releaseApiKeyForSubscription);
        }
        subscriptionRepository.saveAll(stale);
        log.info("Expiry sweep marked {} subscriptions as EXPIRED", stale.size());
        return stale.size();
    }

    // ---- Helpers -----------------------------------------------------------

    @Transactional(readOnly = true)
    public Subscription requireSubscription(UUID subscriptionId) {
        return subscriptionRepository.findById(subscriptionId)
                .orElseThrow(() -> new NotFoundException("Subscription not found"));
    }

    /**
     * Builds a response including the display prefix of the user's delegated key for that API.
     */
    private SubscriptionResponse toResponse(Subscription subscription, UUID apiId, UUID userId) {
        ApiKey key = apiKeyService.findAssignedKey(apiId, userId).orElse(null);
        return SubscriptionResponse.from(subscription, key);
    }
}
