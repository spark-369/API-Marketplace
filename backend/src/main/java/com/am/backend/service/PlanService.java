package com.am.backend.service;

import com.am.backend.cache.CacheNames;
import com.am.backend.dto.PageResponse;
import com.am.backend.dto.PlanRequest;
import com.am.backend.dto.PlanResponse;
import com.am.backend.exception.ConflictException;
import com.am.backend.exception.NotFoundException;
import com.am.backend.model.Api;
import com.am.backend.model.Plan;
import com.am.backend.model.RatePeriod;
import com.am.backend.repository.ApiKeyRepository;
import com.am.backend.repository.PlanRepository;
import com.am.backend.repository.SubscriptionRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.cache.annotation.CacheEvict;
import org.springframework.cache.annotation.Cacheable;
import org.springframework.cache.annotation.Caching;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.util.List;
import java.util.UUID;

import static org.springframework.util.StringUtils.hasText;

/**
 * Plan (pricing tier) management. Plans carry the quota that the gateway enforces, which is why
 * plan mutations also invalidate the key-validation cache.
 */
@Service
public class PlanService {

    private static final Logger log = LoggerFactory.getLogger(PlanService.class);

    private final PlanRepository planRepository;
    private final ApiKeyRepository apiKeyRepository;
    private final SubscriptionRepository subscriptionRepository;
    private final ApiService apiService;

    public PlanService(PlanRepository planRepository,
                       ApiKeyRepository apiKeyRepository,
                       SubscriptionRepository subscriptionRepository,
                       ApiService apiService) {
        this.planRepository = planRepository;
        this.apiKeyRepository = apiKeyRepository;
        this.subscriptionRepository = subscriptionRepository;
        this.apiService = apiService;
    }

    // ---- Reads -------------------------------------------------------------

    /**
     * Public listing of an API's plans.
     */
    @Transactional(readOnly = true)
    @Cacheable(cacheNames = CacheNames.PLANS, key = "'api:' + #apiId")
    public List<PlanResponse> listPlansForApi(UUID apiId) {
        apiService.requireApi(apiId);
        return planRepository.findByApiId(apiId).stream().map(PlanResponse::from).toList();
    }

    @Transactional(readOnly = true)
    @Cacheable(cacheNames = CacheNames.PLANS, key = "'plan:' + #planId")
    public PlanResponse getPlan(UUID apiId, UUID planId) {
        Plan plan = planRepository.findByIdAndApiId(planId, apiId)
                .orElseThrow(() -> new NotFoundException("Plan not found"));
        return PlanResponse.from(plan);
    }

    /**
     * Administrative listing across every API.
     */
    @Transactional(readOnly = true)
    public PageResponse<PlanResponse> listAllPlans(Pageable pageable) {
        return PageResponse.from(planRepository.findAll(pageable), PlanResponse::from);
    }

    // ---- Mutations ---------------------------------------------------------

    @Transactional
    @Caching(evict = {
            @CacheEvict(cacheNames = CacheNames.PLANS, allEntries = true),
            @CacheEvict(cacheNames = CacheNames.KEY_VALIDATION, allEntries = true)
    })
    public PlanResponse createPlan(UUID apiId, PlanRequest request) {
        Api api = apiService.requireManageableApi(apiId);

        String name = request.name().trim();
        if (planRepository.existsByApiIdAndNameIgnoreCase(apiId, name)) {
            throw new ConflictException("A plan named '" + name + "' already exists for this API");
        }

        Plan plan = new Plan();
        plan.setApi(api);
        applyRequest(plan, request, name);

        Plan saved = planRepository.save(plan);
        log.info("Created plan {} ('{}') for API {}", saved.getId(), saved.getName(), apiId);
        return PlanResponse.from(saved);
    }

    @Transactional
    @Caching(evict = {
            @CacheEvict(cacheNames = CacheNames.PLANS, allEntries = true),
            @CacheEvict(cacheNames = CacheNames.KEY_VALIDATION, allEntries = true)
    })
    public PlanResponse updatePlan(UUID apiId, UUID planId, PlanRequest request) {
        apiService.requireManageableApi(apiId);

        Plan plan = planRepository.findByIdAndApiId(planId, apiId)
                .orElseThrow(() -> new NotFoundException("Plan not found"));

        String name = request.name().trim();
        if (!plan.getName().equalsIgnoreCase(name)
                && planRepository.existsByApiIdAndNameIgnoreCase(apiId, name)) {
            throw new ConflictException("A plan named '" + name + "' already exists for this API");
        }

        applyRequest(plan, request, name);

        Plan saved = planRepository.save(plan);
        log.info("Updated plan {} for API {}", planId, apiId);
        return PlanResponse.from(saved);
    }

    /**
     * Deletes a plan, refusing while any API key or subscription still references it.
     *
     * <p>Cascading here would silently strip quota from live customers, so the caller must migrate
     * them first.</p>
     */
    @Transactional
    @Caching(evict = {
            @CacheEvict(cacheNames = CacheNames.PLANS, allEntries = true),
            @CacheEvict(cacheNames = CacheNames.KEY_VALIDATION, allEntries = true)
    })
    public void deletePlan(UUID apiId, UUID planId) {
        apiService.requireManageableApi(apiId);

        Plan plan = planRepository.findByIdAndApiId(planId, apiId)
                .orElseThrow(() -> new NotFoundException("Plan not found"));

        if (apiKeyRepository.existsByPlanId(planId) || subscriptionRepository.existsByPlanId(planId)) {
            throw new ConflictException(
                    "Cannot delete this plan while API keys or subscriptions still reference it");
        }

        planRepository.delete(plan);
        log.info("Deleted plan {} from API {}", planId, apiId);
    }

    // ---- Helpers -----------------------------------------------------------

    @Transactional(readOnly = true)
    public Plan requirePlanForApi(UUID apiId, UUID planId) {
        return planRepository.findByIdAndApiId(planId, apiId)
                .orElseThrow(() -> new NotFoundException("Plan not found"));
    }

    /**
     * Copy request fields onto the entity, applying defaults for omitted values.
     */
    private void applyRequest(Plan plan, PlanRequest request, String name) {
        plan.setName(name);
        plan.setDescription(request.description());
        plan.setPrice(request.price() == null ? BigDecimal.ZERO : request.price());
        plan.setRateLimit(request.rateLimit() == null ? 60 : request.rateLimit());
        plan.setRatePeriod(hasText(request.ratePeriod())
                ? RatePeriod.valueOf(request.ratePeriod())
                : RatePeriod.MINUTE);
        plan.setSupportLevel(hasText(request.supportLevel()) ? request.supportLevel().trim() : "COMMUNITY");
    }
}
