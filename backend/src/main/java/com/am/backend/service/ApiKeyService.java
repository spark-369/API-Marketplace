package com.am.backend.service;

import com.am.backend.cache.CacheNames;
import com.am.backend.dto.ApiKeyCreatedResponse;
import com.am.backend.dto.ApiKeyRequest;
import com.am.backend.dto.ApiKeyResponse;
import com.am.backend.dto.PageResponse;
import com.am.backend.exception.ConflictException;
import com.am.backend.exception.NotFoundException;
import com.am.backend.model.Api;
import com.am.backend.model.ApiKey;
import com.am.backend.model.ApiKeyStatus;
import com.am.backend.model.Plan;
import com.am.backend.model.User;
import com.am.backend.repository.ApiKeyRepository;
import com.am.backend.repository.PlanRepository;
import com.am.backend.security.ApiKeyHasher;
import com.am.backend.security.SecurityUtils;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.cache.annotation.CacheEvict;
import org.springframework.cache.annotation.Cacheable;
import org.springframework.cache.annotation.Caching;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

/**
 * API key lifecycle: pool provisioning, assignment on subscribe, revocation, rotation and the
 * gateway's validation hot path.
 *
 * <h2>Storage model</h2>
 * Only {@code sha256(plaintext)} is persisted. The plaintext is returned exactly once, from
 * {@link #createKey} or {@link #rotateKey}, and is unrecoverable thereafter. Lookups are therefore
 * keyed on the hash, which is also what makes the validation path a single indexed query.
 */
@Service
public class ApiKeyService {

    private static final Logger log = LoggerFactory.getLogger(ApiKeyService.class);

    /** How long a successful key validation may be trusted from cache. */
    private static final long VALIDATION_CACHE_SECONDS = 10L;

    private final ApiKeyRepository apiKeyRepository;
    private final PlanRepository planRepository;
    private final ApiKeyHasher keyHasher;
    private final ApiService apiService;

    /** Fallback quota when a key has no plan bound. */
    private final int defaultLimit;

    /** Fallback window length when a key has no plan bound. */
    private final long defaultWindowSeconds;

    /**
     * Single message for every validation failure mode. Distinguishing "unknown key" from "revoked
     * key" would let a caller enumerate which key hashes exist.
     */
    private static final String INVALID_KEY_MESSAGE = "Invalid or expired API key";

    public ApiKeyService(ApiKeyRepository apiKeyRepository,
                         PlanRepository planRepository,
                         ApiKeyHasher keyHasher,
                         ApiService apiService,
                         @Value("${app.ratelimit.default-limit:60}") int defaultLimit,
                         @Value("${app.ratelimit.default-period-seconds:60}") long defaultWindowSeconds) {
        this.apiKeyRepository = apiKeyRepository;
        this.planRepository = planRepository;
        this.keyHasher = keyHasher;
        this.apiService = apiService;
        this.defaultLimit = defaultLimit;
        this.defaultWindowSeconds = defaultWindowSeconds;
    }

    /**
     * A key that has passed validation, carrying the quota information the gateway needs.
     *
     * <p>Deliberately a flat, serialisable record rather than the {@link ApiKey} entity: this value is
     * written to Redis, and a JPA entity would drag lazy associations (plan, api, user) into the
     * serialised payload, which either fails to serialise or produces a detached graph that breaks on
     * read. The gateway only needs the id and the effective quota.</p>
     *
     * @param keyId         the persisted key's id
     * @param apiId         the API the key is bound to
     * @param limit         effective rate limit (plan quota, or the platform default)
     * @param windowSeconds effective window length
     */
    public record ValidatedKey(UUID keyId, UUID apiId, int limit, long windowSeconds) {
    }

    // ---- Reads -------------------------------------------------------------

    /**
     * Provider view: every key belonging to an API, including unassigned pool keys.
     */
    @Transactional(readOnly = true)
    public List<ApiKeyResponse> listKeysForApi(UUID apiId) {
        apiService.requireManageableApi(apiId);
        return apiKeyRepository.findByApiId(apiId).stream().map(ApiKeyResponse::from).toList();
    }

    /**
     * Paginated provider view of an API's keys.
     */
    @Transactional(readOnly = true)
    public PageResponse<ApiKeyResponse> listKeysForApi(UUID apiId, Pageable pageable) {
        apiService.requireManageableApi(apiId);
        return PageResponse.from(apiKeyRepository.findByApiId(apiId, pageable), ApiKeyResponse::from);
    }

    /**
     * Developer view: keys currently assigned to the caller for a specific API.
     */
    @Transactional(readOnly = true)
    public List<ApiKeyResponse> listMyKeysForApi(UUID apiId) {
        UUID userId = SecurityUtils.requireCurrentUserId();
        return apiKeyRepository.findByApiId(apiId).stream()
                .filter(key -> key.getUser() != null && key.getUser().getId().equals(userId))
                .map(ApiKeyResponse::from)
                .toList();
    }

    /**
     * Developer view across every API they subscribe to.
     */
    @Transactional(readOnly = true)
    public List<ApiKeyResponse> listMyKeys() {
        UUID userId = SecurityUtils.requireCurrentUserId();
        return apiKeyRepository.findByUserId(userId).stream().map(ApiKeyResponse::from).toList();
    }

    /**
     * Administrative listing of every key in the platform.
     */
    @Transactional(readOnly = true)
    public PageResponse<ApiKeyResponse> listAllKeys(Pageable pageable) {
        return PageResponse.from(apiKeyRepository.findAll(pageable), ApiKeyResponse::from);
    }

    @Transactional(readOnly = true)
    public ApiKeyResponse getKey(UUID apiId, UUID keyId) {
        return ApiKeyResponse.from(requireKey(apiId, keyId));
    }

    // ---- Provisioning ------------------------------------------------------

    /**
     * Mints a new key into the provider's unassigned pool.
     *
     * <p>The returned plaintext is the only opportunity to capture the secret.</p>
     */
    @Transactional
    public ApiKeyCreatedResponse createKey(UUID apiId, ApiKeyRequest request) {
        Api api = apiService.requireManageableApi(apiId);
        Plan plan = resolvePlan(apiId, request.planId());

        String plaintext = keyHasher.generate();
        ApiKey key = new ApiKey();
        key.setKeyHash(keyHasher.hash(plaintext));
        key.setKeyPrefix(keyHasher.prefixOf(plaintext));
        key.setName(request.name());
        key.setApi(api);
        key.setPlan(plan);
        key.setStatus(ApiKeyStatus.ACTIVE);
        key.setExpiresAt(request.expiresAt());
        key.setUser(null);

        ApiKey saved = apiKeyRepository.save(key);
        log.info("Provisioned API key {} for API {}", saved.getId(), apiId);

        return ApiKeyCreatedResponse.from(saved, plaintext);
    }

    /**
     * Issues a new secret for an existing key record, preserving its identity, ownership and plan.
     *
     * <p>Rotation is the correct response to a suspected leak: the old secret stops working
     * immediately because only the hash is stored and it is overwritten in place.</p>
     */
    @Transactional
    @Caching(evict = {
            @CacheEvict(cacheNames = CacheNames.KEY_VALIDATION, allEntries = true)
    })
    public ApiKeyCreatedResponse rotateKey(UUID apiId, UUID keyId, String replacementKey) {
        apiService.requireManageableApi(apiId);
        ApiKey key = requireKey(apiId, keyId);

        String plaintext = (replacementKey == null || replacementKey.isBlank())
                ? keyHasher.generate()
                : replacementKey.trim();

        key.setKeyHash(keyHasher.hash(plaintext));
        key.setKeyPrefix(keyHasher.prefixOf(plaintext));
        key.setStatus(ApiKeyStatus.ACTIVE);
        key.setLastUsedAt(null);

        ApiKey saved = apiKeyRepository.save(key);
        log.info("Rotated API key {}", keyId);

        return ApiKeyCreatedResponse.from(saved, plaintext);
    }

    /**
     * Revokes a key permanently. Revoked keys fail validation even when unexpired.
     */
    @Transactional
    @Caching(evict = {
            @CacheEvict(cacheNames = CacheNames.KEY_VALIDATION, allEntries = true)
    })
    public ApiKeyResponse revokeKey(UUID apiId, UUID keyId) {
        apiService.requireManageableApi(apiId);
        ApiKey key = requireKey(apiId, keyId);

        key.setStatus(ApiKeyStatus.REVOKED);
        ApiKey saved = apiKeyRepository.save(key);
        log.info("Revoked API key {}", keyId);

        return ApiKeyResponse.from(saved);
    }

    /**
     * Updates mutable key metadata (label and plan binding). The secret itself is untouched —
     * rotation is the only operation that changes key material.
     */
    @Transactional
    @Caching(evict = {
            @CacheEvict(cacheNames = CacheNames.KEY_VALIDATION, allEntries = true)
    })
    public ApiKeyResponse updateKeyMetadata(UUID apiId, UUID keyId, ApiKeyRequest request) {
        apiService.requireManageableApi(apiId);
        ApiKey key = requireKey(apiId, keyId);

        if (request.name() != null) {
            key.setName(request.name());
        }
        if (request.planId() != null) {
            key.setPlan(resolvePlan(apiId, request.planId()));
        }
        if (request.expiresAt() != null) {
            key.setExpiresAt(request.expiresAt());
        }

        ApiKey saved = apiKeyRepository.save(key);
        log.info("Updated metadata for API key {}", keyId);
        return ApiKeyResponse.from(saved);
    }

    /**
     * Deletes a key record outright. Prefer {@link #revokeKey} when an audit trail matters.
     */
    @Transactional
    @Caching(evict = {
            @CacheEvict(cacheNames = CacheNames.KEY_VALIDATION, allEntries = true)
    })
    public void deleteKey(UUID apiId, UUID keyId) {
        apiService.requireManageableApi(apiId);
        ApiKey key = requireKey(apiId, keyId);
        apiKeyRepository.delete(key);
        log.info("Deleted API key {}", keyId);
    }

    // ---- Pool assignment ---------------------------------------------------

    /**
     * Draws an unassigned key from the provider's pool and binds it to a user.
     *
     * <p>Selection preference is plan-first: when the subscription names a plan, a pooled key bound
     * to that same plan is preferred; if none exists, any pooled key for the API is used. This keeps
     * quota semantics intact for the common case while still allowing providers who do not
     * pre-provision per-plan keys to operate.</p>
     *
     * @param apiId    the API being subscribed to
     * @param plan     the requested plan, or {@code null}
     * @param user     the subscriber who will own the key
     * @return the now-assigned key
     * @throws ConflictException when the pool is empty
     */
    @Transactional
    @Caching(evict = {
            @CacheEvict(cacheNames = CacheNames.KEY_VALIDATION, allEntries = true)
    })
    public ApiKey assignApiKeyForSubscription(UUID apiId, Plan plan, User user) {
        ApiKey key = findPooledKey(apiId, plan)
                .orElseThrow(() -> new ConflictException(
                        "No API keys are currently available for this API. "
                                + "The provider must provision additional keys."));

        key.setUser(user);
        if (key.getPlan() == null && plan != null) {
            key.setPlan(plan);
        }
        ApiKey saved = apiKeyRepository.save(key);
        log.info("Assigned pooled key {} to user {} for API {}", saved.getId(), user.getId(), apiId);
        return saved;
    }

    /**
     * Returns an assigned key to the provider's pool when a subscription ends.
     *
     * <p>The key row survives (preserving its usage history) but is detached from the user. Keys
     * already past their expiry are additionally marked {@code EXPIRED} so they cannot be handed out
     * again.</p>
     */
    @Transactional
    @Caching(evict = {
            @CacheEvict(cacheNames = CacheNames.KEY_VALIDATION, allEntries = true)
    })
    public void releaseApiKeyForSubscription(ApiKey key) {
        if (key == null) {
            return;
        }
        key.setUser(null);
        if (key.getExpiresAt() != null && key.getExpiresAt().isBefore(LocalDateTime.now())) {
            key.setStatus(ApiKeyStatus.EXPIRED);
        }
        apiKeyRepository.save(key);
        log.info("Returned key {} to the pool", key.getId());
    }

    /**
     * Finds the best available pooled key for an API.
     *
     * <p>Plan-specific pool first, then the general pool. The page size of 1 means the database
     * picks the earliest-created candidate rather than loading the whole pool.</p>
     */
    private Optional<ApiKey> findPooledKey(UUID apiId, Plan plan) {
        Pageable firstMatch = PageRequest.of(0, 1);

        if (plan != null) {
            List<ApiKey> planKeys = apiKeyRepository.findPooledKeysForPlan(
                    apiId, plan.getId(), ApiKeyStatus.ACTIVE, firstMatch);
            if (!planKeys.isEmpty()) {
                return Optional.of(planKeys.get(0));
            }
        }

        List<ApiKey> anyKeys = apiKeyRepository.findPooledKeys(apiId, ApiKeyStatus.ACTIVE, firstMatch);
        return anyKeys.isEmpty() ? Optional.empty() : Optional.of(anyKeys.get(0));
    }

    /**
     * Locates the key currently assigned to a user for an API, if any.
     */
    @Transactional(readOnly = true)
    public Optional<ApiKey> findAssignedKey(UUID apiId, UUID userId) {
        return apiKeyRepository.findByApiId(apiId).stream()
                .filter(key -> key.getUser() != null && key.getUser().getId().equals(userId))
                .findFirst();
    }

    // ---- Gateway validation hot path ---------------------------------------

    /**
     * Validates a presented key against a specific API and returns its effective quota.
     *
     * <p>This runs on every gateway request, so it is the one place where caching matters most. The
     * result is cached for {@value #VALIDATION_CACHE_SECONDS}s under the key's <em>hash</em> (never
     * the plaintext), and every mutation path that can change validity — revoke, rotate, delete,
     * plan edit, subscription change — evicts {@code keyValidation}.</p>
     *
     * <p>Checks performed, in order: the key exists; it is {@code ACTIVE}; it is not past
     * {@code expiresAt}; and it belongs to the API in the request path. All failures raise
     * {@link NotFoundException} with an identical message so a caller cannot probe for valid key
     * hashes.</p>
     *
     * @param rawKey the plaintext {@code X-API-Key} value
     * @param apiId  the API the request path targets
     * @return the validated key plus its effective rate limit
     */
    @Transactional(readOnly = true)
    @Cacheable(cacheNames = CacheNames.KEY_VALIDATION,
            key = "T(com.am.backend.cache.CacheNames.Keys).apiKey("
                    + "T(com.am.backend.security.ApiKeyHasherCacheKey).of(#rawKey)) + ':' + #apiId")
    public ValidatedKey validateApiKeyForApi(String rawKey, UUID apiId) {
        if (rawKey == null || rawKey.isBlank()) {
            throw new NotFoundException(INVALID_KEY_MESSAGE);
        }

        ApiKey key = apiKeyRepository.findByKeyHash(keyHasher.hash(rawKey.trim()))
                .orElseThrow(() -> new NotFoundException(INVALID_KEY_MESSAGE));

        if (key.getStatus() != ApiKeyStatus.ACTIVE) {
            log.debug("Rejected {} key presented for API {}", key.getStatus(), apiId);
            throw new NotFoundException(INVALID_KEY_MESSAGE);
        }
        if (key.getExpiresAt() != null && key.getExpiresAt().isBefore(LocalDateTime.now())) {
            log.debug("Rejected expired key {} presented for API {}", key.getId(), apiId);
            throw new NotFoundException(INVALID_KEY_MESSAGE);
        }
        if (!key.getApi().getId().equals(apiId)) {
            log.warn("Key {} is not valid for API {} — cross-API replay attempt", key.getId(), apiId);
            throw new NotFoundException(INVALID_KEY_MESSAGE);
        }

        return new ValidatedKey(key.getId(), apiId, effectiveLimit(key), effectiveWindowSeconds(key));
    }

    /**
     * Sweeps keys past their expiry, flipping them to {@code EXPIRED} and evicting validation cache
     * entries so they stop being honoured immediately. Invoked by the scheduled expiry job.
     *
     * @return the number of keys marked expired
     */
    @Transactional
    @CacheEvict(cacheNames = CacheNames.KEY_VALIDATION, allEntries = true)
    public int expireStaleKeys() {
        List<ApiKey> stale = apiKeyRepository.findExpiredActive(ApiKeyStatus.ACTIVE, LocalDateTime.now());
        if (stale.isEmpty()) {
            return 0;
        }
        stale.forEach(key -> key.setStatus(ApiKeyStatus.EXPIRED));
        apiKeyRepository.saveAll(stale);
        log.info("Expiry sweep marked {} API keys as EXPIRED", stale.size());
        return stale.size();
    }

    // ---- Helpers -----------------------------------------------------------

    @Transactional(readOnly = true)
    public ApiKey requireKey(UUID apiId, UUID keyId) {
        return apiKeyRepository.findByIdAndApiId(keyId, apiId)
                .orElseThrow(() -> new NotFoundException("API key not found"));
    }

    /**
     * Effective quota: the key's plan limit, or the platform default when no plan is bound.
     */
    private int effectiveLimit(ApiKey key) {
        return key.getPlan() == null ? defaultLimit : key.getPlan().getRateLimit();
    }

    private long effectiveWindowSeconds(ApiKey key) {
        return key.getPlan() == null
                ? defaultWindowSeconds
                : key.getPlan().getRatePeriod().seconds();
    }

    private Plan resolvePlan(UUID apiId, UUID planId) {
        if (planId == null) {
            return null;
        }
        return planRepository.findByIdAndApiId(planId, apiId)
                .orElseThrow(() -> new NotFoundException("Plan not found"));
    }
}
