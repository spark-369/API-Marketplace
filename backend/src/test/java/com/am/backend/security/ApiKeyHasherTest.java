package com.am.backend.security;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * Unit tests for API-key minting and hashing.
 *
 * <p>These assertions encode the security properties the gateway depends on: keys are high-entropy,
 * never stored in plaintext, and hash comparison is stable across calls.</p>
 */
class ApiKeyHasherTest {

    private final ApiKeyHasher hasher = new ApiKeyHasher();

    @Nested
    @DisplayName("generate()")
    class Generate {

        @Test
        void producesPrefixedKeys() {
            String key = hasher.generate();

            assertThat(key).startsWith("am_");
            assertThat(key).hasSizeGreaterThan(24);
        }

        @Test
        void producesUniqueKeysAcrossManyCalls() {
            java.util.Set<String> generated = new java.util.HashSet<>();
            for (int i = 0; i < 1000; i++) {
                generated.add(hasher.generate());
            }

            // A collision across 1000 draws would indicate a broken entropy source.
            assertThat(generated).hasSize(1000);
        }

        @Test
        void respectsRequestedLengthForHexVariants() {
            String key = hasher.generate(48);

            assertThat(key).startsWith("am_");
            // 48 hex characters of payload after the prefix.
            assertThat(key.substring(3)).hasSize(48);
        }
    }

    @Nested
    @DisplayName("hash()")
    class Hash {

        @Test
        void isDeterministic() {
            String key = "am_1234567890abcdef";

            assertThat(hasher.hash(key)).isEqualTo(hasher.hash(key));
        }

        @Test
        void producesSha256HexOfExpectedLength() {
            // SHA-256 is 32 bytes => 64 hex characters.
            assertThat(hasher.hash("am_any-key-value")).hasSize(64);
        }

        @Test
        void differsForEvenSlightlyDifferentInputs() {
            assertThat(hasher.hash("am_abc")).isNotEqualTo(hasher.hash("am_abd"));
        }

        @Test
        void returnsNullForNullInput() {
            assertThat(hasher.hash(null)).isNull();
        }

        @Test
        void doesNotEchoThePlaintext() {
            String plaintext = "am_supersecretvalue";

            assertThat(hasher.hash(plaintext)).doesNotContain("supersecret");
        }
    }

    @Nested
    @DisplayName("prefixOf()")
    class PrefixOf {

        @Test
        void truncatesToDisplayLength() {
            String prefix = hasher.prefixOf("am_1234567890abcdefghij");

            assertThat(prefix).isEqualTo("am_12345678");
            assertThat(prefix).hasSize(11);
        }

        @Test
        void toleratesShortKeys() {
            assertThat(hasher.prefixOf("am_1")).isEqualTo("am_1");
        }

        @Test
        void returnsNullForNullInput() {
            assertThat(hasher.prefixOf(null)).isNull();
        }
    }

    @Nested
    @DisplayName("matches()")
    class Matches {

        @Test
        void acceptsTheOriginalValue() {
            String plaintext = "am_matchme";

            assertThat(hasher.matches(plaintext, hasher.hash(plaintext))).isTrue();
        }

        @Test
        void rejectsADifferentValue() {
            assertThat(hasher.matches("am_other", hasher.hash("am_matchme"))).isFalse();
        }

        @Test
        void rejectsNullsWithoutThrowing() {
            assertThat(hasher.matches(null, hasher.hash("am_x"))).isFalse();
            assertThat(hasher.matches("am_x", null)).isFalse();
        }
    }

    @Nested
    @DisplayName("cache-key derivation")
    class CacheKey {

        @Test
        void neverEmbedsThePlaintextSecret() {
            String derived = ApiKeyHasherCacheKey.of("am_toplevelsecret");

            assertThat(derived).doesNotContain("toplevelsecret");
            assertThat(derived).hasSize(32);
        }

        @Test
        void isStableForTheSameInput() {
            assertThat(ApiKeyHasherCacheKey.of("am_same"))
                    .isEqualTo(ApiKeyHasherCacheKey.of("am_same"));
        }

        @Test
        void marksAbsentKeysDistinctly() {
            assertThat(ApiKeyHasherCacheKey.of(null)).isEqualTo("absent");
            assertThat(ApiKeyHasherCacheKey.of("  ")).isEqualTo("absent");
        }
    }
}
