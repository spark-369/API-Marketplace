package com.am.backend.job;

import com.am.backend.service.UsageLogService;
import org.jobrunr.jobs.annotations.Job;
import org.jobrunr.jobs.annotations.Recurring;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

/**
 * Scheduled maintenance for gateway telemetry.
 *
 * <p>Telemetry <em>writes</em> are no longer performed here: the gateway persists a row synchronously
 * via {@code UsageLogService.persist} in its own {@code REQUIRES_NEW} transaction. That is deliberate.
 * The previous design enqueued a JobRunr job from the request thread as a lambda capturing a
 * Spring-proxied bean and a non-serialisable payload; JobRunr could not represent that reliably, the
 * enqueue failure was swallowed, and {@code usage_logs} stayed empty while every {@code @Recurring}
 * job in the application worked normally.</p>
 *
 * <p>This class therefore keeps only the retention prune, which is a genuine {@code @Recurring} job
 * and is the form JobRunr handles without any serialisation ambiguity.</p>
 */
@Component
public class UsageLogJobHandler {

    private static final Logger log = LoggerFactory.getLogger(UsageLogJobHandler.class);

    private final UsageLogService usageLogService;

    /**
     * How many days of raw telemetry to keep, from {@code app.usage.retention-days}.
     *
     * <p>Read from configuration rather than passed as an argument: JobRunr invokes a
     * {@code @Recurring} method from its cron schedule with no caller to supply parameters, so the
     * method signature must be parameterless.</p>
     */
    private final int retentionDays;

    public UsageLogJobHandler(UsageLogService usageLogService,
                              @Value("${app.usage.retention-days:90}") int retentionDays) {
        this.usageLogService = usageLogService;
        this.retentionDays = retentionDays;
    }

    /**
     * Daily retention prune of raw telemetry.
     *
     * <p><strong>Must stay parameterless.</strong> JobRunr rejects any {@code @Recurring} method
     * whose signature is not either empty or a single {@code JobContext} argument, because the
     * scheduler fires it without a caller. The retention window therefore comes from
     * {@code app.usage.retention-days}, injected at construction time.</p>
     */
    @Recurring(id = "usage-log-retention", cron = "0 30 3 * * *")
    @Job(name = "Prune usage logs", retries = 1)
    public void pruneOldUsageLogs() {
        int removed = usageLogService.pruneOlderThan(retentionDays);
        log.info("Usage log retention job removed {} rows (retention={}d)", removed, retentionDays);
    }
}

