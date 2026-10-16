package com.am.backend.controller;

import com.am.backend.dto.PageResponse;
import com.am.backend.dto.SubscriptionRequest;
import com.am.backend.dto.SubscriptionResponse;
import com.am.backend.service.SubscriptionService;
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
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.UUID;

/**
 * Subscription endpoints.
 *
 * <p>Subscribing is a developer action — providers are deliberately excluded from consuming APIs, so
 * they cannot be their own customer for quota purposes. The provider-facing route
 * ({@code GET /apis/{apiId}/subscriptions}) lets a publisher see who is using their API.</p>
 */
@RestController
@RequestMapping("/api")
@Tag(name = "Subscriptions", description = "Entitlements and key delegation")
public class SubscriptionController {

    private final SubscriptionService subscriptionService;

    public SubscriptionController(SubscriptionService subscriptionService) {
        this.subscriptionService = subscriptionService;
    }

    @GetMapping("/apis/{apiId}/subscriptions/my")
    @PreAuthorize("hasAnyRole('DEVELOPER', 'ADMIN')")
    @Operation(summary = "Get your subscription to an API")
    public ResponseEntity<SubscriptionResponse> getMySubscription(@PathVariable UUID apiId) {
        return ResponseEntity.ok(subscriptionService.getMySubscription(apiId));
    }

    @GetMapping("/me/subscriptions")
    @PreAuthorize("hasAnyRole('DEVELOPER', 'ADMIN')")
    @Operation(summary = "List all of your subscriptions")
    public ResponseEntity<List<SubscriptionResponse>> listMySubscriptions() {
        return ResponseEntity.ok(subscriptionService.listMySubscriptions());
    }

    @GetMapping("/apis/{apiId}/subscriptions")
    @PreAuthorize("hasAnyRole('PROVIDER', 'ADMIN')")
    @Operation(summary = "List subscriptions to an API you own",
            description = "Providers see only their own APIs")
    public ResponseEntity<PageResponse<SubscriptionResponse>> listSubscriptionsForApi(
            @PathVariable UUID apiId,
            @PageableDefault(size = 20, sort = "createdAt", direction = Sort.Direction.DESC)
            Pageable pageable) {
        return ResponseEntity.ok(subscriptionService.listSubscriptionsForApi(apiId, pageable));
    }

    @GetMapping("/subscriptions")
    @PreAuthorize("hasRole('ADMIN')")
    @Operation(summary = "List every subscription (admin)")
    public ResponseEntity<PageResponse<SubscriptionResponse>> listAllSubscriptions(
            @PageableDefault(size = 20, sort = "createdAt", direction = Sort.Direction.DESC)
            Pageable pageable) {
        return ResponseEntity.ok(subscriptionService.listAllSubscriptions(pageable));
    }

    @PostMapping("/apis/{apiId}/subscriptions")
    @PreAuthorize("hasAnyRole('DEVELOPER', 'ADMIN')")
    @Operation(summary = "Subscribe to an API",
            description = "Delegates an API key from the provider's pool; 409 when the pool is empty")
    public ResponseEntity<SubscriptionResponse> subscribe(@PathVariable UUID apiId,
                                                          @RequestParam(required = false) UUID planId) {
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(subscriptionService.subscribe(apiId, planId));
    }

    @PutMapping("/apis/{apiId}/subscriptions/{subscriptionId}")
    @PreAuthorize("hasAnyRole('PROVIDER', 'ADMIN')")
    @Operation(summary = "Update a subscription to an API you own")
    public ResponseEntity<SubscriptionResponse> updateSubscription(
            @PathVariable UUID apiId,
            @PathVariable UUID subscriptionId,
            @Valid @RequestBody SubscriptionRequest request) {
        return ResponseEntity.ok(subscriptionService.updateSubscription(subscriptionId, request));
    }

    @PutMapping("/subscriptions/{subscriptionId}")
    @PreAuthorize("hasRole('ADMIN')")
    @Operation(summary = "Update any subscription (admin)")
    public ResponseEntity<SubscriptionResponse> updateSubscriptionAsAdmin(
            @PathVariable UUID subscriptionId,
            @Valid @RequestBody SubscriptionRequest request) {
        return ResponseEntity.ok(subscriptionService.updateSubscription(subscriptionId, request));
    }

    @DeleteMapping("/apis/{apiId}/subscriptions/{subscriptionId}")
    @PreAuthorize("hasAnyRole('DEVELOPER', 'ADMIN')")
    @Operation(summary = "Cancel a subscription",
            description = "Returns the delegated API key to the provider's pool")
    public ResponseEntity<Void> cancelSubscription(@PathVariable UUID apiId,
                                                   @PathVariable UUID subscriptionId) {
        subscriptionService.cancelSubscription(subscriptionId);
        return ResponseEntity.noContent().build();
    }

    @DeleteMapping("/subscriptions/{subscriptionId}")
    @PreAuthorize("hasRole('ADMIN')")
    @Operation(summary = "Cancel any subscription (admin)")
    public ResponseEntity<Void> cancelSubscriptionAsAdmin(@PathVariable UUID subscriptionId) {
        subscriptionService.cancelSubscription(subscriptionId);
        return ResponseEntity.noContent().build();
    }
}
