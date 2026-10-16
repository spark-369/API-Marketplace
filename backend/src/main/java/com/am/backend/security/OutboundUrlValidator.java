package com.am.backend.security;

import com.am.backend.exception.BadRequestException;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import java.net.InetAddress;
import java.net.URI;
import java.net.UnknownHostException;
import java.util.Arrays;
import java.util.List;
import java.util.Locale;
import java.util.Set;

/**
 * Guards the gateway against Server-Side Request Forgery.
 *
 * <p>A provider-supplied {@code baseUrl} is attacker-controlled data as far as the platform is
 * concerned: without validation, a provider could register {@code http://169.254.169.254/} or
 * {@code http://localhost:6379/} and turn the marketplace into a proxy for its own internal
 * network. The defence is layered:</p>
 *
 * <ol>
 *   <li><strong>Scheme allow-list</strong> — only {@code http} and {@code https}.</li>
 *   <li><strong>Host allow-list</strong> (optional) — when {@code app.gateway.allowed-hosts} is
 *       non-empty, only matching hosts can ever be reached.</li>
 *   <li><strong>DNS resolution + IP screening</strong> — every resolved address is checked against
 *       loopback, link-local, private (RFC 1918), unique-local and multicast ranges, and
 *       {@code 0.0.0.0}/broadcast. Because a hostname can resolve differently between validation and
 *       connection (DNS rebinding), callers that need maximum assurance should combine this with a
 *       pinned-IP HTTP client.</li>
 * </ol>
 */
@Component
public class OutboundUrlValidator {

    private static final Logger log = LoggerFactory.getLogger(OutboundUrlValidator.class);

    private static final Set<String> ALLOWED_SCHEMES = Set.of("http", "https");

    private final List<String> allowedHosts;

    public OutboundUrlValidator(@Value("${app.gateway.allowed-hosts:}") String allowedHostsConfig) {
        this.allowedHosts = Arrays.stream(allowedHostsConfig.split(","))
                .map(String::trim)
                .map(host -> host.toLowerCase(Locale.ROOT))
                .filter(host -> !host.isEmpty())
                .toList();
        if (!this.allowedHosts.isEmpty()) {
            log.info("Gateway host allow-list active with {} entries", this.allowedHosts.size());
        }
    }

    /**
     * Validates an outbound target URL, resolving its host and screening every returned address.
     *
     * @param rawUrl the provider-configured base URL or a fully-built upstream target
     * @throws BadRequestException when the URL is malformed, uses a disallowed scheme or host, or
     *                             resolves to a non-routable address
     */
    public void validate(String rawUrl) {
        URI uri = parse(rawUrl);
        validateScheme(uri);
        String host = uri.getHost();
        if (host == null || host.isBlank()) {
            throw new BadRequestException("Upstream URL must include a host");
        }
        validateHostAllowList(host);
        validateResolvedAddresses(host);
    }

    /**
     * @return {@code true} when the URL would be accepted, without throwing
     */
    public boolean isAllowed(String rawUrl) {
        try {
            validate(rawUrl);
            return true;
        } catch (BadRequestException ex) {
            return false;
        }
    }

    public List<String> getAllowedHosts() {
        return allowedHosts;
    }

    private URI parse(String rawUrl) {
        if (rawUrl == null || rawUrl.isBlank()) {
            throw new BadRequestException("Upstream URL is required");
        }
        try {
            URI uri = URI.create(rawUrl.trim());
            if (!uri.isAbsolute()) {
                throw new BadRequestException("Upstream URL must be absolute");
            }
            return uri;
        } catch (IllegalArgumentException ex) {
            throw new BadRequestException("Upstream URL is not a valid URI");
        }
    }

    private void validateScheme(URI uri) {
        String scheme = uri.getScheme();
        if (scheme == null || !ALLOWED_SCHEMES.contains(scheme.toLowerCase(Locale.ROOT))) {
            throw new BadRequestException("Only http and https upstream URLs are permitted");
        }
    }

    private void validateHostAllowList(String host) {
        if (allowedHosts.isEmpty()) {
            return;
        }
        String normalized = host.toLowerCase(Locale.ROOT);
        boolean matched = allowedHosts.stream().anyMatch(entry ->
                normalized.equals(entry) || normalized.endsWith("." + entry));
        if (!matched) {
            throw new BadRequestException("Upstream host is not on the gateway allow-list");
        }
    }

    private void validateResolvedAddresses(String host) {
        InetAddress[] addresses;
        try {
            addresses = InetAddress.getAllByName(host);
        } catch (UnknownHostException ex) {
            throw new BadRequestException("Upstream host could not be resolved");
        }
        if (addresses.length == 0) {
            throw new BadRequestException("Upstream host could not be resolved");
        }
        for (InetAddress address : addresses) {
            if (isBlocked(address)) {
                log.warn("Blocked SSRF attempt: {} resolved to non-routable {}", host, address.getHostAddress());
                throw new BadRequestException("Upstream host resolves to a non-routable address");
            }
        }
    }

    /**
     * Screens an address against the ranges a public gateway must never reach.
     */
    private boolean isBlocked(InetAddress address) {
        return address.isLoopbackAddress()
                || address.isAnyLocalAddress()
                || address.isLinkLocalAddress()
                || address.isSiteLocalAddress()
                || address.isMulticastAddress()
                || isUniqueLocalIpv6(address)
                || isCarrierGradeNat(address);
    }

    /** {@code fc00::/7} — IPv6 unique-local addresses. */
    private boolean isUniqueLocalIpv6(InetAddress address) {
        byte[] bytes = address.getAddress();
        return bytes.length == 16 && (bytes[0] & 0xFE) == 0xFC;
    }

    /** {@code 100.64.0.0/10} — shared address space, often used by cloud metadata proxies. */
    private boolean isCarrierGradeNat(InetAddress address) {
        byte[] bytes = address.getAddress();
        if (bytes.length != 4) {
            return false;
        }
        int first = bytes[0] & 0xFF;
        int second = bytes[1] & 0xFF;
        return first == 100 && second >= 64 && second <= 127;
    }
}
