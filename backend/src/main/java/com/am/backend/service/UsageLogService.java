package com.am.backend.service;

import com.am.backend.cache.CacheNames;
import com.am.backend.dto.PageResponse;
import com.am.backend.dto.UsageLogResponse;
import com.am.backend.model.ApiKey;
import com.am.backend.model.UsageLog;
import com.am.backend.repository.ApiKeyRepository;
import com.am.backend.repository.UsageLogRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.cache.annotation.Cacheable;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.UUID;

/**
 * Gateway telemetry persistence and retrieval.
 *
 * <p>Writes go through {@link #persist(UsageLogPayload)}, which is annotated
 * {@link Propagation#REQUIRES_NEW} because it is executed by a JobRunr background job outside the
 * original request's transaction — the HTTP response has already been returned by the time this
 * runs.</p>
 */
@Service
public class UsageLogService {

    private static final Logger log = LoggerFactory.getLogger(UsageLogService.class);

    /**
     * PII is truncated on write: a full IPv6 address and a multi-kilobyte user agent add no billing
     * value, and keeping them verbatim widens the data-protection surface.
     */
    private static final int MAX_IP_LENGTH = 45;
    private static final int MAX_USER_AGENT_LENGTH = 256;

    private final UsageLogRepository usageLogRepository;
    private final ApiKeyRepository apiKeyRepository;

    public UsageLogService(UsageLogRepository usageLogRepository, ApiKeyRepository apiKeyRepository) {
        this.usageLogRepository = usageLogRepository;
        this.apiKeyRepository = apiKeyRepository;
    }

    /**
     * Immutable carrier for one gateway request's telemetry, passed across the async boundary.
     */
    public record UsageLogPayload(
            UUID apiKeyId,
            String endpoint,
            String method,
            int statusCode,
            long latencyMs,
            String ipAddress,
            String userAgent
    ) {
    }

    /**
     * Persists one telemetry record and stamps the key as used. Invoked from a JobRunr job.
     *
     * <p><strong>Why both writes live here.</strong> JobRunr serialises a job as a single method call
     * on a single bean; a lambda that touches two beans cannot be represented, so enqueueing it fails
     * and — because the gateway swallows enqueue failures to protect the customer request — telemetry
     * is silently dropped. Folding the {@code lastUsedAt} stamp into this method keeps the job a
     * one-bean, one-method call, and reuses the {@link ApiKey} already loaded below rather than
     * issuing a second query.</p>
     *
     * <p>Failures are logged and swallowed: telemetry is valuable but must never fail a customer's
     * request or poison the job queue.</p>
     */
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void persist(UsageLogPayload payload) {
        try {
            ApiKey key = apiKeyRepository.findById(payload.apiKeyId()).orElse(null);
            if (key == null) {
                // The key may have been rotated/deleted between the request and this deferred job.
                // Log at WARN (not silent) so the drop is visible; never fail the caller for it.
                log.warn("Dropping usage log for unknown API key {} — endpoint {} '{}'",
                        payload.apiKeyId(), payload.method(), payload.endpoint());
                return;
            }

            UsageLog entry = new UsageLog();
            entry.setApiKey(key);
            entry.setEndpoint(truncate(payload.endpoint(), 1000));
            entry.setMethod(truncate(payload.method(), 12));
            entry.setStatusCode(payload.statusCode());
            entry.setLatencyMs(payload.latencyMs());
            entry.setIpAddress(truncate(payload.ipAddress(), MAX_IP_LENGTH));
            entry.setUserAgent(truncate(payload.userAgent(), MAX_USER_AGENT_LENGTH));

            usageLogRepository.save(entry);

            // Provider dashboards and staleness detection read this, so it is maintained on the same
            // path that records the request itself.
            key.setLastUsedAt(LocalDateTime.now());
            apiKeyRepository.save(key);
        } catch (Exception ex) {
            // A schema mismatch, FK violation or connectivity problem must not be hidden. Telemetry is
            // still non-fatal to a request, but the reason is logged at ERROR with the full stack trace
            // so an empty usage_logs table can be diagnosed from the logs instead of guessed at.
            log.error("Failed to persist usage log for key {} (method={}, endpoint={}, status={}, latencyMs={})",
                    payload.apiKeyId(), payload.method(), payload.endpoint(),
                    payload.statusCode(), payload.latencyMs(), ex);
        }
    }

    // ---- Reads -------------------------------------------------------------

    /**
     * Usage records for one key. Providers see their own keys; admins see any.
     */
    @Transactional(readOnly = true)
    public PageResponse<UsageLogResponse> listUsageForKey(UUID apiKeyId, Pageable pageable) {
        return PageResponse.from(usageLogRepository.findByApiKeyId(apiKeyId, pageable),
                UsageLogResponse::from);
    }

    /**
     * Usage records for one key inside a time range, used by billing exports and charts.
     */
    @Transactional(readOnly = true)
    public PageResponse<UsageLogResponse> listUsageForKeyBetween(UUID apiKeyId,
                                                                 LocalDateTime from,
                                                                 LocalDateTime to,
                                                                 Pageable pageable) {
        return PageResponse.from(
                usageLogRepository.findByApiKeyIdAndCreatedAtBetween(apiKeyId, from, to, pageable),
                UsageLogResponse::from);
    }

    /**
     * Total request count for a key, cached briefly because provider dashboards poll it.
     */
    @Transactional(readOnly = true)
    @Cacheable(cacheNames = CacheNames.USAGE_STATS, key = "'usage:' + #apiKeyId")
    public long countUsage(UUID apiKeyId) {
        return usageLogRepository.countByApiKeyId(apiKeyId);
    }

    /**
     * Total requests recorded against an API across all of its keys.
     */
    @Transactional(readOnly = true)
    public long countUsageForApi(UUID apiId) {
        return usageLogRepository.countByApiId(apiId);
    }

    /**
     * Retention prune. Called by the daily cleanup job.
     *
     * @param retentionDays how many days of raw telemetry to keep
     * @return the number of rows removed
     */
    @Transactional
    public int pruneOlderThan(int retentionDays) {
        LocalDateTime cutoff = LocalDateTime.now().minusDays(retentionDays);
        int removed = usageLogRepository.deleteOlderThan(cutoff);
        if (removed > 0) {
            log.info("Retention prune removed {} usage logs older than {}", removed, cutoff);
        }
        return removed;
    }

    // ---- Helpers -----------------------------------------------------------

    /**
     * Clips a value to a column's capacity, tolerating nulls.
     */
    private String truncate(String value, int maxLength) {
        if (value == null) {
            return null;
        }
        return value.length() <= maxLength ? value : value.substring(0, maxLength);
    }
}
