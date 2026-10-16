package com.am.backend.controller;

import com.am.backend.dto.PageResponse;
import com.am.backend.dto.ReviewRequest;
import com.am.backend.dto.ReviewResponse;
import com.am.backend.service.ReviewService;
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

import java.util.UUID;

/**
 * Review endpoints.
 *
 * <p>Reviews are public to read. Writing is restricted to developers and admins — providers are
 * excluded so a publisher cannot inflate their own ratings, and every mutation recomputes the
 * owning API's aggregate average.</p>
 */
@RestController
@RequestMapping("/api")
@Tag(name = "Reviews", description = "Ratings and feedback")
public class ReviewController {

    private final ReviewService reviewService;

    public ReviewController(ReviewService reviewService) {
        this.reviewService = reviewService;
    }

    @GetMapping("/apis/{apiId}/reviews")
    @Operation(summary = "List an API's reviews")
    public ResponseEntity<PageResponse<ReviewResponse>> listReviews(
            @PathVariable UUID apiId,
            @PageableDefault(size = 20, sort = "createdAt", direction = Sort.Direction.DESC)
            Pageable pageable) {
        return ResponseEntity.ok(reviewService.listReviews(apiId, pageable));
    }

    @GetMapping("/reviews/all")
    @PreAuthorize("hasRole('ADMIN')")
    @Operation(summary = "List every review across all APIs (admin)")
    public ResponseEntity<PageResponse<ReviewResponse>> listAllReviews(
            @PageableDefault(size = 20, sort = "createdAt", direction = Sort.Direction.DESC)
            Pageable pageable) {
        return ResponseEntity.ok(reviewService.listAllReviews(pageable));
    }

    @PostMapping("/apis/{apiId}/reviews")
    @PreAuthorize("hasAnyRole('DEVELOPER', 'ADMIN')")
    @Operation(summary = "Review an API",
            description = "One review per account per API; returns 409 on a duplicate")
    public ResponseEntity<ReviewResponse> createReview(@PathVariable UUID apiId,
                                                       @Valid @RequestBody ReviewRequest request) {
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(reviewService.createReview(apiId, request));
    }

    @PutMapping("/apis/{apiId}/reviews/{reviewId}")
    @PreAuthorize("hasAnyRole('DEVELOPER', 'ADMIN')")
    @Operation(summary = "Update a review", description = "Author or admin only")
    public ResponseEntity<ReviewResponse> updateReview(@PathVariable UUID apiId,
                                                       @PathVariable UUID reviewId,
                                                       @Valid @RequestBody ReviewRequest request) {
        return ResponseEntity.ok(reviewService.updateReview(apiId, reviewId, request));
    }

    @DeleteMapping("/apis/{apiId}/reviews/{reviewId}")
    @PreAuthorize("hasAnyRole('DEVELOPER', 'ADMIN')")
    @Operation(summary = "Delete a review", description = "Author or admin only")
    public ResponseEntity<Void> deleteReview(@PathVariable UUID apiId, @PathVariable UUID reviewId) {
        reviewService.deleteReview(apiId, reviewId);
        return ResponseEntity.noContent().build();
    }
}
