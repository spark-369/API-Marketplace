package com.am.backend.controller;

import com.am.backend.dto.PageResponse;
import com.am.backend.dto.PlanRequest;
import com.am.backend.dto.PlanResponse;
import com.am.backend.service.PlanService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;
import org.springframework.data.web.PageableDefault;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.UUID;

/**
 * Plan endpoints. Plans are public to read (pricing is marketing material) and provider-owned to
 * write.
 */
@RestController
@RequestMapping("/api")
@Tag(name = "Plans", description = "Pricing tiers and their quotas")
public class PlanController {

    private final PlanService planService;

    public PlanController(PlanService planService) {
        this.planService = planService;
    }

    @GetMapping("/apis/{apiId}/plans")
    @Operation(summary = "List an API's plans")
    public ResponseEntity<List<PlanResponse>> listPlans(@PathVariable UUID apiId) {
        return ResponseEntity.ok(planService.listPlansForApi(apiId));
    }

    @GetMapping("/apis/{apiId}/plans/{planId}")
    @Operation(summary = "Get a plan")
    public ResponseEntity<PlanResponse> getPlan(@PathVariable UUID apiId, @PathVariable UUID planId) {
        return ResponseEntity.ok(planService.getPlan(apiId, planId));
    }

    @GetMapping("/plans/all")
    @PreAuthorize("hasRole('ADMIN')")
    @Operation(summary = "List every plan across all APIs (admin)")
    public ResponseEntity<PageResponse<PlanResponse>> listAllPlans(
            @PageableDefault(size = 20, sort = "createdAt", direction = Sort.Direction.DESC)
            Pageable pageable) {
        return ResponseEntity.ok(planService.listAllPlans(pageable));
    }

    @PostMapping("/apis/{apiId}/plans")
    @PreAuthorize("hasRole('PROVIDER')")
    @Operation(summary = "Create a plan",
            description = "rateLimit and ratePeriod determine the quota the gateway enforces")
    public ResponseEntity<PlanResponse> createPlan(@PathVariable UUID apiId,
                                                   @Valid @RequestBody PlanRequest request) {
        return ResponseEntity.status(HttpStatus.CREATED).body(planService.createPlan(apiId, request));
    }

    @PutMapping("/apis/{apiId}/plans/{planId}")
    @PreAuthorize("hasAnyRole('PROVIDER', 'ADMIN')")
    @Operation(summary = "Update a plan")
    public ResponseEntity<PlanResponse> updatePlan(@PathVariable UUID apiId,
                                                   @PathVariable UUID planId,
                                                   @Valid @RequestBody PlanRequest request) {
        return ResponseEntity.ok(planService.updatePlan(apiId, planId, request));
    }

    @DeleteMapping("/apis/{apiId}/plans/{planId}")
    @PreAuthorize("hasAnyRole('PROVIDER', 'ADMIN')")
    @Operation(summary = "Delete a plan",
            description = "Returns 409 while API keys or subscriptions still reference it")
    public ResponseEntity<Void> deletePlan(@PathVariable UUID apiId, @PathVariable UUID planId) {
        planService.deletePlan(apiId, planId);
        return ResponseEntity.noContent().build();
    }
}
