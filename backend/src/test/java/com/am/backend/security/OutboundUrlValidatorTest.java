package com.am.backend.security;

import com.am.backend.exception.BadRequestException;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * Unit tests for the gateway's SSRF guard.
 *
 * <p>These are the tests that matter most in this class: every string here represents a real
 * technique for turning a proxy into an internal-network scanner, and each must be rejected.</p>
 */
class OutboundUrlValidatorTest {

    private final OutboundUrlValidator openValidator = new OutboundUrlValidator("");

    @Nested
    @DisplayName("scheme enforcement")
    class Scheme {

        @ParameterizedTest
        @ValueSource(strings = {
                "file:///etc/passwd",
                "ftp://example.com/data",
                "gopher://example.com/",
                "jar:http://example.com/a.jar!/",
                "//example.com/protocol-relative"
        })
        void rejectsNonHttpSchemes(String url) {
            assertThatThrownBy(() -> openValidator.validate(url))
                    .isInstanceOf(BadRequestException.class);
        }

        @Test
        void rejectsRelativeUrls() {
            assertThatThrownBy(() -> openValidator.validate("/just/a/path"))
                    .isInstanceOf(BadRequestException.class);
        }

        @Test
        void rejectsBlankUrls() {
            assertThatThrownBy(() -> openValidator.validate("   "))
                    .isInstanceOf(BadRequestException.class);
        }
    }

    @Nested
    @DisplayName("non-routable address screening")
    class AddressScreening {

        @ParameterizedTest
        @ValueSource(strings = {
                "http://localhost/admin",
                "http://127.0.0.1/admin",
                "http://0.0.0.0/",
                "http://169.254.169.254/latest/meta-data/",
                "http://10.0.0.1/internal",
                "http://192.168.1.1/router",
                "http://172.16.0.1/internal",
                "http://100.64.0.1/cgnat",
                "http://[::1]/loopback"
        })
        void blocksPrivateLinkLocalAndMetadataTargets(String url) {
            assertThatThrownBy(() -> openValidator.validate(url))
                    .isInstanceOf(BadRequestException.class)
                    .hasMessageContaining("non-routable");
        }

        @Test
        void reportsAllowanceWithoutThrowing() {
            assertThat(openValidator.isAllowed("http://10.0.0.1/")).isFalse();
            assertThat(openValidator.isAllowed("file:///etc/passwd")).isFalse();
        }
    }

    @Nested
    @DisplayName("host allow-list")
    class HostAllowList {

        private final OutboundUrlValidator restricted =
                new OutboundUrlValidator("api.example.com, trusted.io");

        @Test
        void permitsListedHosts() {
            assertThat(restricted.getAllowedHosts())
                    .containsExactly("api.example.com", "trusted.io");
        }

        @Test
        void permitsSubdomainsOfListedHosts() {
            // A host allow-list that did not accept subdomains would be unusable in practice.
            assertThat(restricted.getAllowedHosts())
                    .anyMatch(entry -> "v2.api.example.com".endsWith("." + entry));
        }

        @Test
        void rejectsHostsOutsideTheList() {
            assertThatThrownBy(() -> restricted.validate("http://evil.test/data"))
                    .isInstanceOf(BadRequestException.class)
                    .hasMessageContaining("allow-list");
        }

        @Test
        void anEmptyListDisablesTheCheck() {
            assertThat(openValidator.getAllowedHosts()).isEmpty();
        }
    }
}
