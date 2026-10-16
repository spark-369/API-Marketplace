package com.am.backend.service;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Unit tests for slug derivation.
 *
 * <p>Slugs are user-visible URL segments, so the interesting cases are the ones where a naive
 * implementation produces something surprising: accented characters, punctuation runs, and names
 * that reduce to nothing at all.</p>
 *
 * <p>Lives in the {@code service} package because {@code ApiService.slugify} is package-private by
 * design — it is an internal helper, not part of the service's public contract. Keeping this test
 * here exercises it directly without widening its visibility just to satisfy a test.</p>
 */
class SlugifyTest {

    @Test
    @DisplayName("lower-cases and hyphenates a plain name")
    void basicName() {
        assertThat(ApiService.slugify("Weather API")).isEqualTo("weather-api");
    }

    @Test
    @DisplayName("strips diacritics rather than dropping the letter")
    void accentsAreFolded() {
        assertThat(ApiService.slugify("Café Météo")).isEqualTo("cafe-meteo");
    }

    @Test
    @DisplayName("collapses punctuation runs into a single hyphen")
    void punctuationRunsCollapse() {
        assertThat(ApiService.slugify("Payments   &&&   Billing")).isEqualTo("payments-billing");
    }

    @Test
    @DisplayName("trims leading and trailing separators")
    void trimsEdges() {
        assertThat(ApiService.slugify("  --Hello World--  ")).isEqualTo("hello-world");
    }

    @Test
    @DisplayName("keeps digits")
    void digitsSurvive() {
        assertThat(ApiService.slugify("Geo IP 2")).isEqualTo("geo-ip-2");
    }

    @Test
    @DisplayName("returns empty for input with no usable characters")
    void unusableInputYieldsEmpty() {
        // Callers substitute a fallback ("api") when this happens.
        assertThat(ApiService.slugify("###")).isEmpty();
        assertThat(ApiService.slugify("")).isEmpty();
        assertThat(ApiService.slugify(null)).isEmpty();
    }

    @ParameterizedTest
    @CsvSource({
            "Simple, simple",
            "TWO WORDS, two-words",
            "kebab-case-name, kebab-case-name",
            "Trailing!, trailing"
    })
    @DisplayName("produces a URL-safe segment for common inputs")
    void urlSafe(String input, String expected) {
        assertThat(ApiService.slugify(input)).isEqualTo(expected);
    }
}
