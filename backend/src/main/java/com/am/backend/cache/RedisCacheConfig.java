package com.am.backend.cache;

import com.fasterxml.jackson.annotation.JsonAutoDetect;
import com.fasterxml.jackson.annotation.JsonTypeInfo;
import com.fasterxml.jackson.annotation.PropertyAccessor;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.jsontype.BasicPolymorphicTypeValidator;
import com.fasterxml.jackson.databind.jsontype.PolymorphicTypeValidator;
import com.fasterxml.jackson.datatype.jsr310.JavaTimeModule;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.cache.Cache;
import org.springframework.cache.annotation.CachingConfigurer;
import org.springframework.cache.interceptor.CacheErrorHandler;
import org.springframework.cache.transaction.TransactionAwareCacheDecorator;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.data.redis.cache.RedisCacheConfiguration;
import org.springframework.data.redis.cache.RedisCacheManager;
import org.springframework.data.redis.connection.RedisConnectionFactory;
import org.springframework.data.redis.serializer.GenericJackson2JsonRedisSerializer;
import org.springframework.data.redis.serializer.RedisSerializationContext;
import org.springframework.data.redis.serializer.StringRedisSerializer;
import org.springframework.lang.NonNull;

import java.time.Duration;
import java.util.Map;

/**
 * Redis-backed Spring Cache configuration.
 *
 * <p>Values are serialised as JSON under the versioned {@code am:cache:v2:} prefix. Because the cached
 * DTOs are Java records (not entities) there is no proxy/lazy-loading hazard. Cache access is treated
 * as non-fatal: {@link #cacheErrorHandler()} evicts an unreadable entry and falls through to the
 * database rather than failing the request.</p>
 */
@Configuration
public class RedisCacheConfig implements CachingConfigurer {

    private static final Logger log = LoggerFactory.getLogger(RedisCacheConfig.class);

    /**
     * Key namespace for cached values.
     *
     * <p>The trailing version segment exists so that a change to the <em>serialised form</em> — not
     * the cached data's meaning — can be rolled out without leaving unreadable entries behind. Bump
     * it whenever {@link #cacheObjectMapper()} changes shape (for example when default typing was
     * enabled), and every pre-existing key is simply never looked up again instead of being read,
     * found unreadable, and evicted one request at a time.</p>
     *
     * <p>Old keys are left to expire on their own TTL, which is at most 5 minutes here.</p>
     */
    private static final String KEY_PREFIX = "am:cache:v2:";

    /**
     * Cache manager for all marketplace caches.
     *
     * <p>The {@code @NonNull} on the factory parameter is not decorative: Spring Data Redis declares
     * {@code RedisCacheManager.builder(@NonNull RedisConnectionFactory)} under a package-level
     * {@code @NonNullApi}. An <em>unannotated</em> parameter is treated by the null-analysis engine
     * as having unknown nullness, so passing it on produces "Null type safety: ... needs unchecked
     * conversion to conform to '@NonNull RedisConnectionFactory'". Spring guarantees this bean is
     * never null, so declaring it explicitly removes the ambiguity rather than suppressing it.</p>
     */
    @Bean
    public RedisCacheManager cacheManager(@NonNull RedisConnectionFactory connectionFactory) {
        RedisCacheConfiguration defaults = RedisCacheConfiguration.defaultCacheConfig()
                .entryTtl(Duration.ofMinutes(1))
                .disableCachingNullValues()
                .prefixCacheNameWith(KEY_PREFIX)
                .serializeKeysWith(RedisSerializationContext.SerializationPair
                        .fromSerializer(new StringRedisSerializer()))
                .serializeValuesWith(RedisSerializationContext.SerializationPair
                        .fromSerializer(new GenericJackson2JsonRedisSerializer(cacheObjectMapper())));

        Map<String, RedisCacheConfiguration> perCache = Map.of(
                CacheNames.API_CATALOG, defaults.entryTtl(Duration.ofSeconds(60)),
                CacheNames.CATEGORIES, defaults.entryTtl(Duration.ofMinutes(5)),
                CacheNames.PLANS, defaults.entryTtl(Duration.ofSeconds(60)),
                CacheNames.KEY_VALIDATION, defaults.entryTtl(Duration.ofSeconds(10)),
                CacheNames.USAGE_STATS, defaults.entryTtl(Duration.ofSeconds(60))
        );

        return RedisCacheManager.builder(connectionFactory)
                .cacheDefaults(defaults)
                .withInitialCacheConfigurations(perCache)
                .transactionAware()
                .build();
    }

    /**
     * Cache failures must never take down a request: log at warn and let the caller hit the DB.
     */
    @Override
    public CacheErrorHandler errorHandler() {
        return cacheErrorHandler();
    }

    @Bean
    public CacheErrorHandler cacheErrorHandler() {
        return new CacheErrorHandler() {

            /**
             * A read failure usually means the stored bytes are unreadable — most often an entry
             * written by an older serialiser (for example before default typing was enabled, which
             * yields "missing type id property '@class'"). Leaving such an entry in place would make
             * <em>every</em> request for that key fail until its TTL lapsed, so it is evicted
             * immediately: the caller falls through to the database, repopulates the key in the
             * current format, and the next read is a clean hit.
             *
             * <p>Eviction is itself best-effort: a Redis outage that caused the original failure will
             * also fail the evict, which is fine — both paths only warn.</p>
             */
            @Override
            public void handleCacheGetError(RuntimeException exception, Cache cache, Object key) {
                log.warn("Cache GET failed on {}::{} — evicting unreadable entry and falling through to source: {}",
                        cache.getName(), key, exception.getMessage());
                evictQuietly(cache, key);
            }

            @Override
            public void handleCachePutError(RuntimeException exception, Cache cache, Object key, Object value) {
                log.warn("Cache PUT failed on {}::{} — value not cached: {}",
                        cache.getName(), key, exception.getMessage());
            }

            @Override
            public void handleCacheEvictError(RuntimeException exception, Cache cache, Object key) {
                log.warn("Cache EVICT failed on {}::{} — entry may be stale: {}",
                        cache.getName(), key, exception.getMessage());
            }

            @Override
            public void handleCacheClearError(RuntimeException exception, Cache cache) {
                log.warn("Cache CLEAR failed on {}: {}", cache.getName(), exception.getMessage());
            }

            /**
             * Removes a poisoned entry without letting a secondary failure escape the error handler,
             * which would turn a degraded-cache situation into a failed request.
             *
             * <p><strong>Evicts the underlying cache, not the decorator.</strong> The cache manager is
             * {@code transactionAware()}, so the {@link Cache} handed to a cache aspect is a
             * {@code TransactionAwareCacheDecorator}: its {@code evict} is deferred to
             * {@code afterCommit}, and is <em>skipped entirely</em> when no transaction is active. On a
             * read path there is no transaction to synchronise with, so evicting through the decorator
             * either does nothing or happens too late — and concurrent requests then race on the same
             * unreadable entry, each logging a failure before any of them clears it. Unwrapping to the
             * target cache makes the removal immediate and unconditional.</p>
             */
            private void evictQuietly(Cache cache, Object key) {
                try {
                    unwrapDecorators(cache).evict(key);
                } catch (RuntimeException evictFailure) {
                    log.warn("Cache EVICT after read failure also failed on {}::{}: {}",
                            cache.getName(), key, evictFailure.getMessage());
                }
            }

            /**
             * Peels off Spring's transaction decorator to reach the cache that talks to Redis.
             *
             * <p>{@code TransactionAwareCacheDecorator} exposes {@code getTargetCache()}, so this is an
             * explicit unwrap rather than a guess. Any other implementation is returned unchanged —
             * notably {@code RedisCache} itself, which is the base case.</p>
             */
            private Cache unwrapDecorators(Cache cache) {
                if (cache instanceof TransactionAwareCacheDecorator transactional) {
                    return transactional.getTargetCache();
                }
                return cache;
            }
        };
    }

    /**
     * Mapper used for cache values.
     *
     * <p><strong>Default typing is mandatory here.</strong> {@link GenericJackson2JsonRedisSerializer}
     * only writes a concrete type marker when the mapper has default typing enabled. Without it the
     * payload is plain JSON, and Jackson deserialises a cached record back as a
     * {@link java.util.LinkedHashMap} — which the cache proxy then fails to cast to the method's
     * declared return type, producing:
     * {@code ClassCastException: class java.util.LinkedHashMap cannot be cast to class
     * com.am.backend.dto.PageResponse} on every cache <em>hit</em> (the first, cache-missing request
     * succeeds, which is what makes the failure look intermittent).</p>
     *
     * <p>{@link JavaTimeModule} is registered because the DTOs carry {@code LocalDateTime} fields, and
     * {@code java.util} is included in the validator because {@link PageResponse#content()} is a
     * {@code List} whose element type must be recoverable from the stored JSON.</p>
     */
    private ObjectMapper cacheObjectMapper() {
        ObjectMapper mapper = new ObjectMapper();
        mapper.registerModule(new JavaTimeModule());
        mapper.setVisibility(PropertyAccessor.ALL, JsonAutoDetect.Visibility.ANY);
        mapper.activateDefaultTyping(cacheTypeValidator(), ObjectMapper.DefaultTyping.NON_FINAL, JsonTypeInfo.As.PROPERTY);
        return mapper;
    }

    /**
     * Restricts which types may be materialised when reading a cache entry.
     *
     * <p>Default typing makes the serialised class name authoritative, so an attacker able to write to
     * Redis could otherwise name an arbitrary type and drive deserialisation gadgets. The allow-list
     * covers only this application's own classes plus the JDK collection types the DTOs use.</p>
     */
    private PolymorphicTypeValidator cacheTypeValidator() {
        return BasicPolymorphicTypeValidator.builder()
                .allowIfSubType("com.am.backend.")
                .allowIfSubType("java.util.")
                .allowIfSubType("java.time.")
                .allowIfSubType("java.lang.")
                .build();
    }
}
