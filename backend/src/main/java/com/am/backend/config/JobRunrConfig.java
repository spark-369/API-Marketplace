package com.am.backend.config;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/**
 * Background-job startup validation.
 *
 * <h2>Why this class exists</h2>
 * <p>The {@code jobrunr-spring-boot-3-starter} picks its {@link org.jobrunr.storage.StorageProvider}
 * by auto-detection: when a JDBC {@code DataSource} is present it selects the SQL backend. Because
 * this application has both a DataSource and Redis, that choice was previously implicit — jobs were
 * written to PostgreSQL ({@code jobrunr_*} tables) while the operational documentation described a
 * Redis-backed queue and sent incident diagnosis to
 * {@code redis-cli --scan --pattern 'jobrunr:*'}, where nothing is ever written.</p>
 *
 * <p>The backend is now pinned explicitly in {@code application.properties}
 * ({@code jobrunr.database.type=sql}) so the runtime matches the documented SQL schema instead of
 * depending on what happens to be on the classpath.</p>
 *
 * <h2>Fail-fast guard</h2>
 * <p>Gateway telemetry is persisted exclusively by a background job. If the background job server
 * is disabled while the gateway is live, the platform serves traffic normally while never writing
 * a single usage record — a silent failure that is expensive to notice. This class refuses to start
 * in that combination unless explicitly overridden.</p>
 */
@Configuration
public class JobRunrConfig {

    private static final Logger log = LoggerFactory.getLogger(JobRunrConfig.class);

    private final boolean backgroundJobServerEnabled;
    private final boolean failFastOnDisabledServer;

    public JobRunrConfig(
            @Value("${jobrunr.background-job-server.enabled:true}") boolean backgroundJobServerEnabled,
            @Value("${app.jobrunr.fail-fast-when-server-disabled:true}") boolean failFastOnDisabledServer) {
        this.backgroundJobServerEnabled = backgroundJobServerEnabled;
        this.failFastOnDisabledServer = failFastOnDisabledServer;
    }

    /**
     * Refuses to start when the jobs that persist telemetry can never run.
     *
     * <p>The check executes while the context is refreshing, so a misconfigured deployment fails at
     * boot with an actionable message rather than at 3am with an empty {@code usage_logs} table. Set
     * {@code app.jobrunr.fail-fast-when-server-disabled=false} to opt out — for example when this
     * instance is API-only and a separate worker instance runs the background job server.</p>
     *
     * @return a marker bean so the validation participates in context startup
     */
    @Bean
    public JobServerGuard jobServerGuard() {
        if (!backgroundJobServerEnabled && failFastOnDisabledServer) {
            throw new IllegalStateException(
                    "jobrunr.background-job-server.enabled=false while the gateway is live: no background "
                            + "job server can consume the 'Persist usage log' job, so usage_logs would stay "
                            + "empty while requests still succeed. Enable the server, run a dedicated worker "
                            + "instance, or set app.jobrunr.fail-fast-when-server-disabled=false to accept "
                            + "the loss explicitly.");
        }
        if (!backgroundJobServerEnabled) {
            log.warn("Background job server is DISABLED. Usage telemetry will not be persisted by a job "
                    + "(the gateway falls back to a synchronous write), and recurring jobs — expiry sweeps, "
                    + "rating reconciliation and usage-log retention — will not run.");
        }
        return new JobServerGuard(backgroundJobServerEnabled);
    }

    /**
     * Marker bean produced by {@link #jobServerGuard()} so the validation participates in context
     * startup.
     */
    public record JobServerGuard(boolean backgroundJobServerEnabled) {
    }
}
