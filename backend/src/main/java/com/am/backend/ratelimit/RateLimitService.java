package com.am.backend.ratelimit;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.data.redis.core.script.DefaultRedisScript;
import org.springframework.data.redis.core.script.RedisScript;
import org.springframework.stereotype.Service;

import java.util.Collections;
import java.util.List;

/**
 * Fixed-window rate limiter backed by Redis.
 *
 * <p>Each window is a single counter key {@code am:rl:{scope}:{bucket}} holding the number of
 * requests seen in that window. {@code INCR} followed by a conditional {@code EXPIRE} is executed
 * as one Lua script so that concurrent callers cannot both create the counter without setting its
 * TTL — the classic "INCR succeeded but EXPIRE was lost" race.</p>
 *
 * <p><strong>Failure policy.</strong> Redis being unreachable is a policy decision, configured per
 * deployment via {@code app.ratelimit.fail-open}:</p>
 * <ul>
 *   <li><em>fail-open</em> (default, appropriate for free/community tiers) — the request is allowed
 *       and the failure is logged. Availability is preferred over enforcement.</li>
 *   <li><em>fail-closed</em> (appropriate for paid tiers) — the request is rejected with 429 so that
 *       a Redis outage cannot be used to bypass quota.</li>
 * </ul>
 */
@Service
public class RateLimitService {

    private static final Logger log = LoggerFactory.getLogger(RateLimitService.class);

    private static final String KEY_PREFIX = "am:rl:";

    /**
     * Atomically increments the window counter and guarantees it has a TTL.
     *
     * <p>KEYS[1] = counter key; ARGV[1] = window seconds. Returns {counter, ttl}.</p>
     */
    private static final String LUA_SCRIPT = """
            local current = redis.call('INCR', KEYS[1])
            if current == 1 then
              redis.call('EXPIRE', KEYS[1], ARGV[1])
            end
            local ttl = redis.call('TTL', KEYS[1])
            if ttl < 0 then
              redis.call('EXPIRE', KEYS[1], ARGV[1])
              ttl = tonumber(ARGV[1])
            end
            return {current, ttl}
            """;

    private final StringRedisTemplate redisTemplate;
    private final RedisScript<List> rateLimitScript;
    private final boolean failOpen;

    public RateLimitService(StringRedisTemplate redisTemplate,
                            @Value("${app.ratelimit.fail-open:true}") boolean failOpen) {
        this.redisTemplate = redisTemplate;
        this.failOpen = failOpen;

        DefaultRedisScript<List> script = new DefaultRedisScript<>();
        script.setScriptText(LUA_SCRIPT);
        script.setResultType(List.class);
        this.rateLimitScript = script;
    }

    /**
     * Consumes one unit of quota for the given scope.
     *
     * @param scope        identifies the subject being limited (API key id or API id)
     * @param limit        maximum requests permitted inside the window
     * @param windowSeconds length of the fixed window in seconds
     * @return the outcome; {@link RateLimitDecision#allowed()} is false when quota is exhausted
     */
    public RateLimitDecision consume(String scope, int limit, long windowSeconds) {
        if (limit <= 0 || windowSeconds <= 0) {
            return RateLimitDecision.allowed(limit, windowSeconds);
        }

        long bucket = System.currentTimeMillis() / 1000L / windowSeconds;
        String key = KEY_PREFIX + scope + ":" + bucket;

        try {
            List<?> result = redisTemplate.execute(
                    rateLimitScript,
                    Collections.singletonList(key),
                    String.valueOf(windowSeconds)
            );

            if (result == null || result.size() < 2) {
                return handleRedisFailure(scope, "script returned no result");
            }

            long current = ((Number) result.get(0)).longValue();
            long ttl = ((Number) result.get(1)).longValue();
            long retryAfter = ttl > 0 ? ttl : windowSeconds;

            if (current > limit) {
                log.debug("Rate limit exceeded for {}: {}/{} per {}s", scope, current, limit, windowSeconds);
                return RateLimitDecision.denied(limit, windowSeconds, retryAfter);
            }
            return RateLimitDecision.allowed(limit, windowSeconds);

        } catch (Exception ex) {
            return handleRedisFailure(scope, ex.getMessage());
        }
    }

    /**
     * Reads the current counter without consuming, for diagnostics and admin dashboards.
     *
     * @return requests already recorded in the active window, or {@code -1} when unavailable
     */
    public long currentUsage(String scope, long windowSeconds) {
        long bucket = System.currentTimeMillis() / 1000L / windowSeconds;
        String key = KEY_PREFIX + scope + ":" + bucket;
        try {
            String value = redisTemplate.opsForValue().get(key);
            return value == null ? 0L : Long.parseLong(value);
        } catch (Exception ex) {
            log.warn("Unable to read rate-limit counter for {}: {}", scope, ex.getMessage());
            return -1L;
        }
    }

    /**
     * Clears the counter for the active window — used when a subscription changes plan and the
     * customer should not inherit the previous tier's consumption.
     */
    public void reset(String scope, long windowSeconds) {
        long bucket = System.currentTimeMillis() / 1000L / windowSeconds;
        try {
            redisTemplate.delete(KEY_PREFIX + scope + ":" + bucket);
        } catch (Exception ex) {
            log.warn("Unable to reset rate-limit counter for {}: {}", scope, ex.getMessage());
        }
    }

    public boolean isFailOpen() {
        return failOpen;
    }

    private RateLimitDecision handleRedisFailure(String scope, String reason) {
        if (failOpen) {
            log.warn("Rate limiter unavailable for {} ({}) — failing OPEN, request permitted", scope, reason);
            return RateLimitDecision.allowed(Integer.MAX_VALUE, 1);
        }
        log.error("Rate limiter unavailable for {} ({}) — failing CLOSED, request denied", scope, reason);
        return RateLimitDecision.denied(0, 60, 60);
    }
}
