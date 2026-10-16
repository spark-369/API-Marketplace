package com.am.backend.controller;

import com.am.backend.dto.ApiRequest;
import com.am.backend.dto.ApiResponse;
import com.am.backend.dto.PageResponse;
import com.am.backend.service.ApiService;
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

import java.util.UUID;

/**
 * API catalog endpoints.
 *
 * <p>Reads are public and never expose non-published or private APIs. Writes are restricted to
 * providers (own APIs only) and admins (any API), enforced both here by role and inside
 * {@code ApiService} by ownership.</p>
 */
@RestController
@RequestMapping("/api/apis")
@Tag(name = "APIs", description = "Catalog browsing and provider authoring")
public class ApiController {

    private final ApiService apiService;

    public ApiController(ApiService apiService) {
        this.apiService = apiService;
    }

    /**
     * Public catalog listing, supporting category filtering and free-text search.
     */
    @GetMapping
    @Operation(summary = "Browse the public catalog",
            description = "Published, non-private APIs only. Supports ?categoryId= and ?search=")
    public ResponseEntity<PageResponse<ApiResponse>> listApis(
            @RequestParam(required = false) UUID categoryId,
            @RequestParam(required = false) String search,
            @PageableDefault(size = 20, sort = "createdAt", direction = Sort.Direction.DESC)
            Pageable pageable) {
        return ResponseEntity.ok(apiService.listPublished(categoryId, search, pageable));
    }

    @GetMapping("/published")
    @Operation(summary = "Browse the public catalog",
            description = "Alias of GET /api/apis for clients that prefer an explicit path")
    public ResponseEntity<PageResponse<ApiResponse>> listPublished(
            @RequestParam(required = false) UUID categoryId,
            @RequestParam(required = false) String search,
            @PageableDefault(size = 20, sort = "createdAt", direction = Sort.Direction.DESC)
            Pageable pageable) {
        return ResponseEntity.ok(apiService.listPublished(categoryId, search, pageable));
    }

    @GetMapping("/all")
    @PreAuthorize("hasRole('ADMIN')")
    @Operation(summary = "List every API regardless of status (admin)")
    public ResponseEntity<PageResponse<ApiResponse>> listAllApis(
            @PageableDefault(size = 20, sort = "createdAt", direction = Sort.Direction.DESC)
            Pageable pageable) {
        return ResponseEntity.ok(apiService.listAll(pageable));
    }

    @GetMapping("/my")
    @PreAuthorize("hasAnyRole('PROVIDER', 'ADMIN')")
    @Operation(summary = "List APIs owned by the current provider",
            description = "Admins receive every API")
    public ResponseEntity<PageResponse<ApiResponse>> listMyApis(
            @PageableDefault(size = 20, sort = "createdAt", direction = Sort.Direction.DESC)
            Pageable pageable) {
        return ResponseEntity.ok(apiService.listMine(pageable));
    }

    @GetMapping("/{id}")
    @Operation(summary = "Get an API by id",
            description = "Returns 404 — not 403 — when the caller may not view the API")
    public ResponseEntity<ApiResponse> getApi(@PathVariable UUID id) {
        return ResponseEntity.ok(apiService.getApi(id));
    }

    @GetMapping("/slug/{slug}")
    @Operation(summary = "Get an API by slug")
    public ResponseEntity<ApiResponse> getApiBySlug(@PathVariable String slug) {
        return ResponseEntity.ok(apiService.getApiBySlug(slug));
    }

    @PostMapping
    @PreAuthorize("hasRole('PROVIDER')")
    @Operation(summary = "Create an API",
            description = "New APIs default to DRAFT + PRIVATE so an accidental publish is impossible")
    public ResponseEntity<ApiResponse> createApi(@Valid @RequestBody ApiRequest request) {
        return ResponseEntity.status(HttpStatus.CREATED).body(apiService.createApi(request));
    }

    @PutMapping("/{id}")
    @PreAuthorize("hasAnyRole('PROVIDER', 'ADMIN')")
    @Operation(summary = "Update an API",
            description = "Providers may only update APIs they own")
    public ResponseEntity<ApiResponse> updateApi(@PathVariable UUID id,
                                                 @Valid @RequestBody ApiRequest request) {
        return ResponseEntity.ok(apiService.updateApi(id, request));
    }

    @DeleteMapping("/{id}")
    @PreAuthorize("hasAnyRole('PROVIDER', 'ADMIN')")
    @Operation(summary = "Delete an API",
            description = "Cascades to its plans, keys, subscriptions and reviews")
    public ResponseEntity<Void> deleteApi(@PathVariable UUID id) {
        apiService.deleteApi(id);
        return ResponseEntity.noContent().build();
    }
}
