package com.am.backend.service;

import com.am.backend.cache.CacheNames;
import com.am.backend.dto.PageResponse;
import com.am.backend.dto.ReviewRequest;
import com.am.backend.dto.ReviewResponse;
import com.am.backend.exception.ConflictException;
import com.am.backend.exception.NotFoundException;
import com.am.backend.model.Api;
import com.am.backend.model.Review;
import com.am.backend.model.User;
import com.am.backend.repository.ApiRepository;
import com.am.backend.repository.ReviewRepository;
import com.am.backend.security.SecurityUtils;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.cache.annotation.CacheEvict;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.List;
import java.util.UUID;

/**
 * Reviews and the denormalized rating aggregate they drive.
 *
 * <p>Exactly one review per (API, user) pair is enforced twice: by a database unique constraint and
 * by an explicit service check that produces a friendly 409 instead of an opaque constraint
 * violation.</p>
 */
@Service
public class ReviewService {

    private static final Logger log = LoggerFactory.getLogger(ReviewService.class);

    private static final int RATING_SCALE = 2;

    private final ReviewRepository reviewRepository;
    private final ApiRepository apiRepository;
    private final ApiService apiService;

    public ReviewService(ReviewRepository reviewRepository,
                         ApiRepository apiRepository,
                         ApiService apiService) {
        this.reviewRepository = reviewRepository;
        this.apiRepository = apiRepository;
        this.apiService = apiService;
    }

    // ---- Reads -------------------------------------------------------------

    /**
     * Public listing of an API's reviews.
     */
    @Transactional(readOnly = true)
    public PageResponse<ReviewResponse> listReviews(UUID apiId, Pageable pageable) {
        apiService.requireApi(apiId);
        return PageResponse.from(reviewRepository.findByApiId(apiId, pageable), ReviewResponse::from);
    }

    /**
     * Administrative listing across every API.
     */
    @Transactional(readOnly = true)
    public PageResponse<ReviewResponse> listAllReviews(Pageable pageable) {
        return PageResponse.from(reviewRepository.findAll(pageable), ReviewResponse::from);
    }

    // ---- Mutations ---------------------------------------------------------

    /**
     * Creates the caller's review of an API.
     *
     * @throws ConflictException when the caller has already reviewed this API
     */
    @Transactional
    @CacheEvict(cacheNames = CacheNames.API_CATALOG, allEntries = true)
    public ReviewResponse createReview(UUID apiId, ReviewRequest request) {
        Api api = apiService.requireApi(apiId);
        User author = SecurityUtils.requireCurrentUser();

        if (reviewRepository.existsByApiIdAndUserId(apiId, author.getId())) {
            throw new ConflictException("You have already reviewed this API");
        }

        Review review = new Review();
        review.setApi(api);
        review.setUser(author);
        review.setRating(request.rating());
        review.setTitle(request.title());
        review.setComment(request.comment());

        Review saved = reviewRepository.save(review);
        recalculateApiRating(apiId);

        log.info("Review {} created on API {} by {}", saved.getId(), apiId, author.getId());
        return ReviewResponse.from(saved);
    }

    /**
     * Updates a review. Only its author (or an admin) may do so.
     */
    @Transactional
    @CacheEvict(cacheNames = CacheNames.API_CATALOG, allEntries = true)
    public ReviewResponse updateReview(UUID apiId, UUID reviewId, ReviewRequest request) {
        Review review = requireReview(apiId, reviewId);
        SecurityUtils.assertCanManage(review.getUser().getId(), "review");

        review.setRating(request.rating());
        review.setTitle(request.title());
        review.setComment(request.comment());

        Review saved = reviewRepository.save(review);
        recalculateApiRating(apiId);
        return ReviewResponse.from(saved);
    }

    /**
     * Deletes a review. Only its author (or an admin) may do so.
     */
    @Transactional
    @CacheEvict(cacheNames = CacheNames.API_CATALOG, allEntries = true)
    public void deleteReview(UUID apiId, UUID reviewId) {
        Review review = requireReview(apiId, reviewId);
        SecurityUtils.assertCanManage(review.getUser().getId(), "review");

        reviewRepository.delete(review);
        recalculateApiRating(apiId);
        log.info("Review {} deleted from API {}", reviewId, apiId);
    }

    // ---- Rating aggregation ------------------------------------------------

    /**
     * Recomputes an API's denormalized {@code averageRating} and {@code reviewCount}.
     *
     * <p>Called inline after every review mutation. The same logic is exposed as a JobRunr task so
     * that a bulk import or a repair job can recompute ratings off the request path — see
     * {@code RatingJobHandler}.</p>
     *
     * @return the recalculated average, for callers that want to log or assert on it
     */
    @Transactional
    public BigDecimal recalculateApiRating(UUID apiId) {
        Api api = apiRepository.findById(apiId)
                .orElseThrow(() -> new NotFoundException("API not found"));

        Double average = reviewRepository.averageRatingForApi(apiId);
        long count = reviewRepository.countByApiId(apiId);

        BigDecimal rounded = average == null
                ? BigDecimal.ZERO
                : BigDecimal.valueOf(average).setScale(RATING_SCALE, RoundingMode.HALF_UP);

        api.setAverageRating(rounded);
        api.setReviewCount(count);
        apiRepository.save(api);

        log.debug("Recalculated rating for API {}: {} from {} reviews", apiId, rounded, count);
        return rounded;
    }

    /**
     * Recomputes ratings for every API. Intended for scheduled or on-demand repair runs.
     *
     * @return the number of APIs whose rating was recomputed
     */
    @Transactional
    public int recalculateAllRatings() {
        List<Api> apis = apiRepository.findAll();
        apis.forEach(api -> {
            Double average = reviewRepository.averageRatingForApi(api.getId());
            api.setAverageRating(average == null
                    ? BigDecimal.ZERO
                    : BigDecimal.valueOf(average).setScale(RATING_SCALE, RoundingMode.HALF_UP));
            api.setReviewCount(reviewRepository.countByApiId(api.getId()));
        });
        apiRepository.saveAll(apis);
        log.info("Recomputed ratings for {} APIs", apis.size());
        return apis.size();
    }

    // ---- Helpers -----------------------------------------------------------

    @Transactional(readOnly = true)
    public Review requireReview(UUID apiId, UUID reviewId) {
        return reviewRepository.findByIdAndApiId(reviewId, apiId)
                .orElseThrow(() -> new NotFoundException("Review not found"));
    }
}
