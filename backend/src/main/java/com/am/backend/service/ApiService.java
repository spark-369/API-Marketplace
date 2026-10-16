package com.am.backend.service;

import com.am.backend.cache.CacheNames;
import com.am.backend.dto.ApiRequest;
import com.am.backend.dto.ApiResponse;
import com.am.backend.dto.PageResponse;
import com.am.backend.exception.ConflictException;
import com.am.backend.exception.NotFoundException;
import com.am.backend.model.Api;
import com.am.backend.model.ApiStatus;
import com.am.backend.model.ApiVisibility;
import com.am.backend.model.Category;
import com.am.backend.model.User;
import com.am.backend.repository.ApiKeyRepository;
import com.am.backend.repository.ApiRepository;
import com.am.backend.repository.CategoryRepository;
import com.am.backend.repository.PlanRepository;
import com.am.backend.repository.ReviewRepository;
import com.am.backend.repository.SubscriptionRepository;
import com.am.backend.security.SecurityUtils;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.cache.annotation.CacheEvict;
import org.springframework.cache.annotation.Cacheable;
import org.springframework.cache.annotation.Caching;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.text.Normalizer;
import java.util.Locale;
import java.util.UUID;

import static org.springframework.util.StringUtils.hasText;

/**
 * API catalog: CRUD, visibility enforcement and cache invalidation.
 *
 * <h2>Visibility masking</h2>
 * The catalog distinguishes "you may not do this" from "this does not exist". An API that is not
 * publicly visible AND not owned by the requester is reported as <strong>404, not 403</strong>, so an
 * unauthorised caller cannot use status codes to enumerate the existence of draft or private APIs.
 */
@Service
public class ApiService {

    private static final Logger log = LoggerFactory.getLogger(ApiService.class);

    private final ApiRepository apiRepository;
    private final CategoryRepository categoryRepository;
    private final PlanRepository planRepository;
    private final ApiKeyRepository apiKeyRepository;
    private final ReviewRepository reviewRepository;
    private final SubscriptionRepository subscriptionRepository;
    private final PublicApiCacheReader publicApiCacheReader;

    public ApiService(ApiRepository apiRepository,
                      CategoryRepository categoryRepository,
                      PlanRepository planRepository,
                      ApiKeyRepository apiKeyRepository,
                      ReviewRepository reviewRepository,
                      SubscriptionRepository subscriptionRepository,
                      PublicApiCacheReader publicApiCacheReader) {
        this.apiRepository = apiRepository;
        this.categoryRepository = categoryRepository;
        this.planRepository = planRepository;
        this.apiKeyRepository = apiKeyRepository;
        this.reviewRepository = reviewRepository;
        this.subscriptionRepository = subscriptionRepository;
        this.publicApiCacheReader = publicApiCacheReader;
    }

    // ---- Public catalogue --------------------------------------------------

    /**
     * Public catalog listing with optional category filter and free-text search.
     *
     * <p>An unauthenticated caller (or any non-admin) only ever sees published, non-private APIs.</p>
     */
    @Transactional(readOnly = true)
    @Cacheable(cacheNames = CacheNames.API_CATALOG,
            key = "'" + CacheNames.Keys.PUBLISHED + ":' + (#categoryId == null ? 'all' : #categoryId)"
                    + " + ':' + (#search == null ? '' : #search) + ':' + #pageable.pageNumber"
                    + " + ':' + #pageable.pageSize")
    public PageResponse<ApiResponse> listPublished(UUID categoryId, String search, Pageable pageable) {
        Page<Api> page;
        if (hasText(search)) {
            page = apiRepository.searchPublicCatalog(ApiStatus.PUBLISHED, ApiVisibility.PRIVATE,
                    search.trim(), pageable);
        } else if (categoryId != null) {
            page = apiRepository.findPublicCatalogByCategory(ApiStatus.PUBLISHED, ApiVisibility.PRIVATE,
                    categoryId, pageable);
        } else {
            page = apiRepository.findPublicCatalog(ApiStatus.PUBLISHED, ApiVisibility.PRIVATE, pageable);
        }
        return PageResponse.from(page, ApiResponse::from);
    }

    /**
     * Listing of every API, for administrators.
     */
    @Transactional(readOnly = true)
    public PageResponse<ApiResponse> listAll(Pageable pageable) {
        return PageResponse.from(apiRepository.findAll(pageable), ApiResponse::from);
    }

    /**
     * APIs owned by the calling provider (or all APIs when the caller is an admin).
     */
    @Transactional(readOnly = true)
    public PageResponse<ApiResponse> listMine(Pageable pageable) {
        UUID ownerId = SecurityUtils.requireCurrentUserId();
        Page<Api> page = SecurityUtils.isAdmin()
                ? apiRepository.findAll(pageable)
                : apiRepository.findByOwnerId(ownerId, pageable);
        return PageResponse.from(page, ApiResponse::from);
    }

    // ---- Lookups -----------------------------------------------------------

    /**
     * Fetches an API by id, applying visibility masking.
     *
     * <p><strong>Cache safety.</strong> {@link #canView(Api)} depends on the calling principal, but
     * the {@code apiCatalog} entry is keyed only by id — it carries no principal dimension. Caching a
     * non-public record here would therefore let a provider's own draft/private read populate an
     * entry that an anonymous caller subsequently hits, returning the draft with a 200 and defeating
     * the 404-masking rule entirely. Only publicly visible APIs are cached; every other read is
     * resolved and masked without touching the cache.</p>
     *
     * @throws NotFoundException when the API does not exist OR the caller may not see it
     */
    @Transactional(readOnly = true)
    public ApiResponse getApi(UUID id) {
        Api api = apiRepository.findById(id)
                .orElseThrow(() -> new NotFoundException("API not found"));
        if (!canView(api)) {
            log.debug("Masking non-visible API {} as 404 for current principal", id);
            throw new NotFoundException("API not found");
        }
        // Publicly visible records are identical for every caller, so they are safe to cache by id.
        if (api.isPubliclyVisible()) {
            return publicApiCacheReader.byId(id);
        }
        return ApiResponse.from(api);
    }

    /**
     * Fetches an API by slug, applying visibility masking as {@link #getApi(UUID)}.
     */
    @Transactional(readOnly = true)
    public ApiResponse getApiBySlug(String slug) {
        Api api = apiRepository.findBySlug(slug)
                .orElseThrow(() -> new NotFoundException("API not found"));
        if (!canView(api)) {
            throw new NotFoundException("API not found");
        }
        if (api.isPubliclyVisible()) {
            return publicApiCacheReader.bySlug(slug);
        }
        return ApiResponse.from(api);
    }

    /**
     * Convenience helper for callers that have no filters and want the first page.
     */
    @Transactional(readOnly = true)
    public PageResponse<ApiResponse> listPublishedSimple(Pageable pageable) {
        return listPublished(null, null, pageable);
    }

    // ---- Mutation ----------------------------------------------------------

    /**
     * Creates an API owned by the calling principal.
     *
     * <p>New APIs start as {@code DRAFT}/{@code PRIVATE} unless the request explicitly asks
     * otherwise, so an accidental publish is not possible.</p>
     */
    @Transactional
    @Caching(evict = {
            @CacheEvict(cacheNames = CacheNames.API_CATALOG, allEntries = true)
    })
    public ApiResponse createApi(ApiRequest request) {
        User owner = SecurityUtils.requireCurrentUser();

        Api api = new Api();
        api.setName(request.name().trim());
        api.setSlug(resolveSlug(request.slug(), request.name(), null));
        api.setDescription(request.description());
        api.setBaseUrl(trimTrailingSlash(request.baseUrl()));
        api.setDocumentationUrl(request.documentationUrl());
        api.setVersion(hasText(request.version()) ? request.version().trim() : "1.0.0");
        api.setStatus(parseStatus(request.status(), ApiStatus.DRAFT));
        api.setVisibility(parseVisibility(request.visibility(), ApiVisibility.PRIVATE));
        api.setCategory(resolveCategory(request.categoryId()));
        api.setOwner(owner);

        Api saved = apiRepository.save(api);
        log.info("Created API '{}' ({}) owned by {}", saved.getName(), saved.getId(), owner.getId());
        return ApiResponse.from(saved);
    }

    /**
     * Updates an API, enforcing provider ownership (admins may edit any API).
     */
    @Transactional
    @Caching(evict = {
            @CacheEvict(cacheNames = CacheNames.API_CATALOG, allEntries = true)
    })
    public ApiResponse updateApi(UUID id, ApiRequest request) {
        Api api = requireApi(id);
        SecurityUtils.assertCanManage(api.getOwner().getId(), "API");

        api.setName(request.name().trim());
        api.setSlug(resolveSlug(request.slug(), request.name(), id));
        api.setDescription(request.description());
        api.setBaseUrl(trimTrailingSlash(request.baseUrl()));
        api.setDocumentationUrl(request.documentationUrl());
        if (hasText(request.version())) {
            api.setVersion(request.version().trim());
        }
        api.setStatus(parseStatus(request.status(), api.getStatus()));
        api.setVisibility(parseVisibility(request.visibility(), api.getVisibility()));

        // categoryId is sticky when absent; send the "none" sentinel to clear it.
        if (request.categoryId() != null) {
            api.setCategory(resolveCategory(request.categoryId()));
        }

        Api saved = apiRepository.save(api);
        log.info("Updated API {} (status={}, visibility={})", saved.getId(), saved.getStatus(), saved.getVisibility());
        return ApiResponse.from(saved);
    }

    /**
     * Deletes an API and every dependent record, in FK-safe order.
     *
     * <p>Ordering matters: usage logs reference keys, keys and subscriptions reference the API, and
     * plans are referenced by both keys and subscriptions.</p>
     */
    @Transactional
    @Caching(evict = {
            @CacheEvict(cacheNames = CacheNames.API_CATALOG, allEntries = true),
            @CacheEvict(cacheNames = CacheNames.PLANS, allEntries = true),
            @CacheEvict(cacheNames = CacheNames.KEY_VALIDATION, allEntries = true),
            @CacheEvict(cacheNames = CacheNames.USAGE_STATS, allEntries = true)
    })
    public void deleteApi(UUID id) {
        Api api = requireApi(id);
        SecurityUtils.assertCanManage(api.getOwner().getId(), "API");

        reviewRepository.deleteAll(reviewRepository.findByApiId(id));
        subscriptionRepository.deleteAll(subscriptionRepository.findByApiId(id));
        apiKeyRepository.deleteAll(apiKeyRepository.findByApiId(id));
        planRepository.deleteAll(planRepository.findByApiId(id));
        apiRepository.delete(api);

        log.info("Deleted API {} and all dependent records", id);
    }

    // ---- Visibility & helpers ----------------------------------------------

    /**
     * Core visibility predicate.
     *
     * <p>True when the API is publicly visible (PUBLISHED and not PRIVATE) or the caller is the
     * owner or an admin. Note that the owner can always see their own drafts.</p>
     */
    @Transactional(readOnly = true)
    public boolean canView(Api api) {
        if (api.isPubliclyVisible()) {
            return true;
        }
        return SecurityUtils.currentUser()
                .map(user -> user.isAdmin() || user.getId().equals(api.getOwner().getId()))
                .orElse(false);
    }

    @Transactional(readOnly = true)
    public Api requireApi(UUID id) {
        return apiRepository.findById(id)
                .orElseThrow(() -> new NotFoundException("API not found"));
    }

    /**
     * Asserts the caller owns the API (or is an admin), returning the entity for further mutation.
     */
    @Transactional(readOnly = true)
    public Api requireManageableApi(UUID id) {
        Api api = requireApi(id);
        SecurityUtils.assertCanManage(api.getOwner().getId(), "API");
        return api;
    }

    private Category resolveCategory(UUID categoryId) {
        if (categoryId == null) {
            return null;
        }
        return categoryRepository.findById(categoryId)
                .orElseThrow(() -> new NotFoundException("Category not found"));
    }

    /**
     * Resolves a unique slug.
     *
     * <p>An explicit slug that is already taken is a conflict. A slug derived from the name gets a
     * numeric suffix instead, so two providers can both publish "Weather API".</p>
     *
     * @param requested  the caller-supplied slug, or {@code null} to derive one
     * @param name       the API name, used for derivation
     * @param currentId  the API being updated, excluded from the uniqueness check
     */
    private String resolveSlug(String requested, String name, UUID currentId) {
        if (hasText(requested)) {
            String slug = requested.trim();
            if (isSlugTaken(slug, currentId)) {
                throw new ConflictException("The slug '" + slug + "' is already in use");
            }
            return slug;
        }

        String base = slugify(name);
        if (base.isEmpty()) {
            base = "api";
        }
        String candidate = base;
        int suffix = 2;
        while (isSlugTaken(candidate, currentId)) {
            candidate = base + "-" + suffix++;
        }
        return candidate;
    }

    private boolean isSlugTaken(String slug, UUID currentId) {
        return apiRepository.findBySlug(slug)
                .filter(existing -> currentId == null || !existing.getId().equals(currentId))
                .isPresent();
    }

    /**
     * URL-safe, accented-character-tolerant slug derivation.
     */
    static String slugify(String input) {
        if (input == null) {
            return "";
        }
        String normalized = Normalizer.normalize(input.trim(), Normalizer.Form.NFD)
                .replaceAll("\\p{M}", "")
                .toLowerCase(Locale.ROOT);
        return normalized
                .replaceAll("[^a-z0-9]+", "-")
                .replaceAll("(^-+)|(-+$)", "");
    }

    private ApiStatus parseStatus(String value, ApiStatus fallback) {
        return hasText(value) ? ApiStatus.valueOf(value) : fallback;
    }

    private ApiVisibility parseVisibility(String value, ApiVisibility fallback) {
        return hasText(value) ? ApiVisibility.valueOf(value) : fallback;
    }

    private String trimTrailingSlash(String url) {
        if (url == null) {
            return null;
        }
        String trimmed = url.trim();
        while (trimmed.endsWith("/")) {
            trimmed = trimmed.substring(0, trimmed.length() - 1);
        }
        return trimmed;
    }
}
