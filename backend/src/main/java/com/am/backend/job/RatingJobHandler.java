package com.am.backend.job;

import com.am.backend.service.ReviewService;
import org.jobrunr.jobs.annotations.Job;
import org.jobrunr.jobs.annotations.Recurring;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

/**
 * Rating aggregate maintenance.
 *
 * <p>Reviews recompute their API's average inline, which is correct and cheap for the common case.
 * This handler exists for <em>bulk</em> paths: imports, data repairs, or a manual reconciliation
 * after an incident, where recomputing in the request thread would be unacceptable.</p>
 */
@Component
public class RatingJobHandler {

    private static final Logger log = LoggerFactory.getLogger(RatingJobHandler.class);

    private final ReviewService reviewService;

    public RatingJobHandler(ReviewService reviewService) {
        this.reviewService = reviewService;
    }

    /**
     * Recomputes the rating aggregate for one API.
     */
    @Job(name = "Recompute API rating", retries = 2)
    public void recomputeRating(java.util.UUID apiId) {
        var average = reviewService.recalculateApiRating(apiId);
        log.info("Rating job recomputed API {} to {}", apiId, average);
    }

    /**
     * Nightly full reconciliation, guarding against drift from any missed inline update.
     */
    @Recurring(id = "rating-reconciliation", cron = "0 45 3 * * *")
    @Job(name = "Reconcile all API ratings", retries = 1)
    public void reconcileAllRatings() {
        int count = reviewService.recalculateAllRatings();
        log.info("Rating reconciliation job processed {} APIs", count);
    }
}
