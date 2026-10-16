package com.am.backend.job;

import com.am.backend.service.ApiKeyService;
import com.am.backend.service.SubscriptionService;
import org.jobrunr.jobs.annotations.Job;
import org.jobrunr.jobs.annotations.Recurring;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

/**
 * Scheduled lifecycle sweeps.
 *
 * <p>Expiry is enforced at request time as well (the gateway checks {@code expiresAt} directly), so
 * these jobs are about <em>state hygiene</em>, not correctness under load: they flip stale rows to
 * {@code EXPIRED}, release pooled keys, and evict the validation cache so a revoked or expired
 * credential stops being honoured immediately instead of after its cache TTL.</p>
 */
@Component
public class ExpirySweepJobHandler {

    private static final Logger log = LoggerFactory.getLogger(ExpirySweepJobHandler.class);

    private final ApiKeyService apiKeyService;
    private final SubscriptionService subscriptionService;

    public ExpirySweepJobHandler(ApiKeyService apiKeyService,
                                 SubscriptionService subscriptionService) {
        this.apiKeyService = apiKeyService;
        this.subscriptionService = subscriptionService;
    }

    /**
     * Hourly sweep of API keys past their expiry instant.
     */
    @Recurring(id = "api-key-expiry-sweep", cron = "0 5 * * * *")
    @Job(name = "Sweep expired API keys", retries = 2)
    public void sweepExpiredApiKeys() {
        int expired = apiKeyService.expireStaleKeys();
        log.info("API key expiry sweep complete: {} keys expired", expired);
    }

    /**
     * Hourly sweep of subscriptions past their expiry instant, releasing delegated keys.
     */
    @Recurring(id = "subscription-expiry-sweep", cron = "0 15 * * * *")
    @Job(name = "Sweep expired subscriptions", retries = 2)
    public void sweepExpiredSubscriptions() {
        int expired = subscriptionService.expireStaleSubscriptions();
        log.info("Subscription expiry sweep complete: {} subscriptions expired", expired);
    }
}
