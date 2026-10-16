package com.am.backend.controller;

import com.am.backend.dto.ApiKeyCreatedResponse;
import com.am.backend.dto.ApiKeyRequest;
import com.am.backend.dto.ApiKeyResponse;
import com.am.backend.dto.PageResponse;
import com.am.backend.dto.RotateApiKeyRequest;
import com.am.backend.dto.UsageLogResponse;
import com.am.backend.service.ApiKeyService;
import com.am.backend.service.UsageLogService;
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
 * API key endpoints.
 *
 * <p>Keys are shown only in truncated prefix form. The full secret is returned exactly once — by
 * create or rotate — and only the SHA-256 hash is persisted, so a database disclosure cannot be
 * replayed against the gateway.</p>
 */
@RestController
@RequestMapping("/api")
@Tag(name = "API Keys", description = "Credential pool management")
public class ApiKeyController {

    private final ApiKeyService apiKeyService;
    private final UsageLogService usageLogService;

    public ApiKeyController(ApiKeyService apiKeyService, UsageLogService usageLogService) {
        this.apiKeyService = apiKeyService;
        this.usageLogService = usageLogService;
    }

    @GetMapping("/apis/{apiId}/keys")
    @PreAuthorize("hasAnyRole('PROVIDER', 'ADMIN')")
    @Operation(summary = "List an API's keys, including unassigned pool keys")
    public ResponseEntity<PageResponse<ApiKeyResponse>> listKeys(
            @PathVariable UUID apiId,
            @PageableDefault(size = 20, sort = "createdAt", direction = Sort.Direction.DESC)
            Pageable pageable) {
        return ResponseEntity.ok(apiKeyService.listKeysForApi(apiId, pageable));
    }

    @GetMapping("/apis/{apiId}/keys/my")
    @PreAuthorize("hasAnyRole('DEVELOPER', 'ADMIN')")
    @Operation(summary = "List the keys assigned to you for an API")
    public ResponseEntity<List<ApiKeyResponse>> listMyKeysForApi(@PathVariable UUID apiId) {
        return ResponseEntity.ok(apiKeyService.listMyKeysForApi(apiId));
    }

    @GetMapping("/keys/my")
    @PreAuthorize("hasAnyRole('DEVELOPER', 'ADMIN')")
    @Operation(summary = "List every key assigned to you")
    public ResponseEntity<List<ApiKeyResponse>> listMyKeys() {
        return ResponseEntity.ok(apiKeyService.listMyKeys());
    }

    @GetMapping("/keys/all")
    @PreAuthorize("hasRole('ADMIN')")
    @Operation(summary = "List every key in the platform (admin)")
    public ResponseEntity<PageResponse<ApiKeyResponse>> listAllKeys(
            @PageableDefault(size = 20, sort = "createdAt", direction = Sort.Direction.DESC)
            Pageable pageable) {
        return ResponseEntity.ok(apiKeyService.listAllKeys(pageable));
    }

    @GetMapping("/apis/{apiId}/keys/{keyId}")
    @PreAuthorize("hasAnyRole('PROVIDER', 'ADMIN')")
    @Operation(summary = "Get a key's metadata")
    public ResponseEntity<ApiKeyResponse> getKey(@PathVariable UUID apiId, @PathVariable UUID keyId) {
        return ResponseEntity.ok(apiKeyService.getKey(apiId, keyId));
    }

    @PostMapping("/apis/{apiId}/keys")
    @PreAuthorize("hasRole('PROVIDER')")
    @Operation(summary = "Provision a key into your pool",
            description = "The plaintext key is returned once and never again")
    public ResponseEntity<ApiKeyCreatedResponse> createKey(@PathVariable UUID apiId,
                                                           @Valid @RequestBody ApiKeyRequest request) {
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(apiKeyService.createKey(apiId, request));
    }

    @PostMapping("/apis/{apiId}/keys/{keyId}/rotate")
    @PreAuthorize("hasAnyRole('PROVIDER', 'ADMIN')")
    @Operation(summary = "Rotate a key",
            description = "Issues a new secret in place; the previous secret stops working immediately")
    public ResponseEntity<ApiKeyCreatedResponse> rotateKey(@PathVariable UUID apiId,
                                                           @PathVariable UUID keyId,
                                                           @Valid @RequestBody(required = false)
                                                           RotateApiKeyRequest request) {
        String replacement = request == null ? null : request.replacementKey();
        return ResponseEntity.ok(apiKeyService.rotateKey(apiId, keyId, replacement));
    }

    @PutMapping("/apis/{apiId}/keys/{keyId}")
    @PreAuthorize("hasAnyRole('PROVIDER', 'ADMIN')")
    @Operation(summary = "Update key metadata such as its label")
    public ResponseEntity<ApiKeyResponse> updateKey(@PathVariable UUID apiId,
                                                    @PathVariable UUID keyId,
                                                    @Valid @RequestBody ApiKeyRequest request) {
        return ResponseEntity.ok(apiKeyService.updateKeyMetadata(apiId, keyId, request));
    }

    @PostMapping("/apis/{apiId}/keys/{keyId}/revoke")
    @PreAuthorize("hasAnyRole('PROVIDER', 'ADMIN')")
    @Operation(summary = "Revoke a key permanently")
    public ResponseEntity<ApiKeyResponse> revokeKey(@PathVariable UUID apiId, @PathVariable UUID keyId) {
        return ResponseEntity.ok(apiKeyService.revokeKey(apiId, keyId));
    }

    @DeleteMapping("/apis/{apiId}/keys/{keyId}")
    @PreAuthorize("hasAnyRole('PROVIDER', 'ADMIN')")
    @Operation(summary = "Delete a key record")
    public ResponseEntity<Void> deleteKey(@PathVariable UUID apiId, @PathVariable UUID keyId) {
        apiKeyService.deleteKey(apiId, keyId);
        return ResponseEntity.noContent().build();
    }

    @GetMapping("/apis/{apiId}/keys/{keyId}/usage")
    @PreAuthorize("hasAnyRole('PROVIDER', 'ADMIN')")
    @Operation(summary = "List gateway telemetry for a key")
    public ResponseEntity<PageResponse<UsageLogResponse>> listUsage(
            @PathVariable UUID apiId,
            @PathVariable UUID keyId,
            @PageableDefault(size = 50, sort = "createdAt", direction = Sort.Direction.DESC)
            Pageable pageable) {
        // Reading the key through the manageable-API path asserts ownership before telemetry is exposed.
        apiKeyService.getKey(apiId, keyId);
        return ResponseEntity.ok(usageLogService.listUsageForKey(keyId, pageable));
    }
}
