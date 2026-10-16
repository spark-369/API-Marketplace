package com.am.backend.cache;

/**
 * Central registry of cache names and key-builders.
 *
 * <p>Every {@code @Cacheable} / {@code @CacheEvict} in the service layer must reference a name
 * declared here so that TTLs, prefixes and invalidation points stay discoverable in one place.</p>
 */
public final class CacheNames {

    private CacheNames() {
    }

    /** Published API catalog reads. TTL 60s. */
    public static final String API_CATALOG = "apiCatalog";

    /** Category listings and lookups. TTL 5 minutes. */
    public static final String CATEGORIES = "categories";

    /** Plan listings per API. TTL 60s. */
    public static final String PLANS = "plans";

    /** Short-lived API-key validation results. TTL 10s. */
    public static final String KEY_VALIDATION = "keyValidation";

    /** Aggregated usage statistics per API key. TTL 60s. */
    public static final String USAGE_STATS = "usageStats";

    /**
     * Key builders — kept as constants so that eviction always targets the same key that
     * populated the entry.
     */
    public static final class Keys {

        private Keys() {
        }

        public static final String PUBLISHED = "published";

        public static String apiById(Object id) {
            return "id:" + id;
        }

        public static String apiBySlug(Object slug) {
            return "slug:" + slug;
        }

        public static String categoryById(Object id) {
            return "id:" + id;
        }

        public static final String ALL_CATEGORIES = "all";

        public static String plansByApi(Object apiId) {
            return "api:" + apiId;
        }

        public static String planById(Object planId) {
            return "plan:" + planId;
        }

        public static String apiKey(String keyHash) {
            return "key:" + keyHash;
        }

        public static String usageByKey(Object apiKeyId) {
            return "usage:" + apiKeyId;
        }
    }
}
