package com.am.backend.service;

import com.am.backend.dto.GatewayResponse;
import com.am.backend.exception.BadRequestException;
import com.am.backend.model.Api;
import com.am.backend.repository.ApiRepository;
import com.am.backend.security.OutboundUrlValidator;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.Set;
import java.util.UUID;
import java.util.regex.Pattern;

/**
 * Forwards gateway traffic to a provider's upstream API.
 *
 * <h2>Hop-by-hop header stripping</h2>
 * RFC 7230 hop-by-hop headers describe a single transport connection and must not be relayed to the
 * next hop. Forwarding them can corrupt framing (a stale {@code Content-Length} or
 * {@code Transfer-Encoding} causes a downstream proxy to mis-parse the body) or leak internal
 * routing information. They are stripped in both directions, and the caller's identity headers are
 * replaced with the platform's own so that a subscriber cannot impersonate another tenant upstream.
 */
@Service
public class GatewayService {

    private static final Logger log = LoggerFactory.getLogger(GatewayService.class);

    /** Headers that must never be forwarded, in either direction. */
    private static final Set<String> HOP_BY_HOP_HEADERS = Set.of(
            "connection",
            "keep-alive",
            "proxy-authenticate",
            "proxy-authorization",
            "te",
            "trailer",
            "transfer-encoding",
            "upgrade",
            "host",
            "content-length",
            HttpHeaders.AUTHORIZATION.toLowerCase(),
            "cookie",
            "set-cookie",
            "x-api-key",
            // The gateway materialises the upstream body as a String, so it cannot relay an encoded
            // payload faithfully. Forwarding the browser's Accept-Encoding would invite the upstream
            // to gzip (or brotli) the response, whose bytes would then be decoded as UTF-8 text and
            // rendered as garbage — the tell-tale mojibake starting with the gzip magic bytes.
            // Dropping it inbound is paired with forcing identity on the outbound leg below.
            "accept-encoding"
    );

    /** Prevents request-path traversal and other malformed path segments reaching upstream. */
    private static final Pattern UNSAFE_PATH_SEGMENT = Pattern.compile("(^|/)\\.\\.(/|$)");

    private final ApiRepository apiRepository;
    private final OutboundUrlValidator urlValidator;
    private final Duration connectTimeout;
    private final Duration readTimeout;
    private final int maxResponseBodyBytes;

    /**
     * Single, reusable JDK HTTP client.
     *
     * <p>{@link java.net.http.HttpClient} owns a connection pool and a selector thread, and the JDK
     * documents it as immutable and safe to share. Building one per request — as an earlier
     * implementation did — discards connection reuse and spawns a thread per call. It is therefore a
     * field, not a local. Note also that on Java 17 the type is <em>not</em> {@link AutoCloseable}
     * (that arrived in Java 21), so it must never be used as a try-with-resources resource.</p>
     */
    private final java.net.http.HttpClient httpClient;

    public GatewayService(ApiRepository apiRepository,
                          OutboundUrlValidator urlValidator,
                          @Value("${app.gateway.connect-timeout-ms:10000}") long connectTimeoutMs,
                          @Value("${app.gateway.read-timeout-ms:30000}") long readTimeoutMs,
                          @Value("${app.gateway.max-response-body-bytes:1048576}") int maxResponseBodyBytes) {
        this.apiRepository = apiRepository;
        this.urlValidator = urlValidator;
        this.connectTimeout = Duration.ofMillis(connectTimeoutMs);
        this.readTimeout = Duration.ofMillis(readTimeoutMs);
        this.maxResponseBodyBytes = maxResponseBodyBytes;
        this.httpClient = java.net.http.HttpClient.newBuilder()
                .connectTimeout(this.connectTimeout)
                .followRedirects(java.net.http.HttpClient.Redirect.NEVER)
                .build();
    }

    public Duration getConnectTimeout() {
        return connectTimeout;
    }

    public Duration getReadTimeout() {
        return readTimeout;
    }

    public int getMaxResponseBodyBytes() {
        return maxResponseBodyBytes;
    }

    /**
     * @return the hop-by-hop header names stripped on both legs
     */
    public Set<String> getHopByHopHeaders() {
        return HOP_BY_HOP_HEADERS;
    }

    /**
     * Builds the absolute upstream URL for a path relative to an API's base URL.
     *
     * <p>Exposed separately so the URL can be validated and logged before any network activity.</p>
     *
     * @param api  the target API
     * @param path the sub-path from the gateway route, possibly empty
     * @return an absolute URL, guaranteed free of path-traversal segments
     */
    @Transactional(readOnly = true)
    public String buildUpstreamUrl(Api api, String path) {
        String base = api.getBaseUrl();
        if (base.endsWith("/")) {
            base = base.substring(0, base.length() - 1);
        }
        if (path == null || path.isBlank()) {
            return base;
        }
        String clean = path.startsWith("/") ? path.substring(1) : path;
        if (UNSAFE_PATH_SEGMENT.matcher(clean).find() || clean.contains("..")) {
            throw new BadRequestException("Upstream path contains an illegal segment");
        }
        return base + "/" + clean;
    }

    /**
     * Resolves an API by id.
     */
    @Transactional(readOnly = true)
    public Api requireApi(UUID apiId) {
        return apiRepository.findById(apiId)
                .orElseThrow(() -> new BadRequestException("API not found"));
    }

    /**
     * Forwards a request to the upstream API and returns its response verbatim.
     *
     * <p>Upstream 4xx and 5xx responses are <em>not</em> translated into platform errors: the
     * subscriber asked for the provider's semantics and should receive them unaltered. Only
     * transport-level failures become {@link BadRequestException}.</p>
     *
     * @param api           the target API (already resolved)
     * @param path          the sub-path from the gateway route
     * @param method        the HTTP method to replay upstream
     * @param body          the request body, or {@code null}
     * @param contentType   the inbound {@code Content-Type}, or {@code null}
     * @param callerHeaders headers to forward, already filtered by the caller
     * @return the upstream response, with latency and a truncation flag
     */
    public GatewayResponse forward(Api api,
                                   String path,
                                   HttpMethod method,
                                   String body,
                                   String contentType,
                                   HttpHeaders callerHeaders) {

        String targetUrl = buildUpstreamUrl(api, path);

        // SSRF gate: scheme, optional host allow-list, and every resolved IP.
        urlValidator.validate(targetUrl);

        long start = System.nanoTime();
        try {
            var requestBuilder = java.net.http.HttpRequest.newBuilder()
                    .uri(java.net.URI.create(targetUrl))
                    .timeout(readTimeout)
                    .method(method.name(), bodyPublisher(method, body));

            callerHeaders.forEach((name, values) -> {
                if (!HOP_BY_HOP_HEADERS.contains(name.toLowerCase())) {
                    values.forEach(value -> requestBuilder.header(name, value));
                }
            });
            if (contentType != null) {
                requestBuilder.header(HttpHeaders.CONTENT_TYPE, contentType);
            }
            // Identify the platform to the upstream; never the subscriber's own credentials.
            requestBuilder.header("X-Forwarded-For", "api-marketplace");
            requestBuilder.header("User-Agent", "api-marketplace-gateway/1.0");
            // Demand an uncompressed body. The JDK HttpClient does not decompress transparently, and
            // GatewayResponse carries the body as text, so a gzip/brotli response would be mangled the
            // moment it is decoded as UTF-8.
            //
            // Note this uses `setHeader`, not `header`: the latter appends, so any Accept-Encoding that
            // survived the inbound filter would be sent alongside `identity` and a server is entitled
            // to honour either value.
            requestBuilder.setHeader("Accept-Encoding", "identity");

            var response = httpClient.send(requestBuilder.build(),
                    java.net.http.HttpResponse.BodyHandlers.ofByteArray());

            long latencyMs = (System.nanoTime() - start) / 1_000_000L;

            // Note: this is the JDK's java.net.http.HttpHeaders (returned by HttpResponse.headers()),
            // not org.springframework.http.HttpHeaders — the two share a simple name but are unrelated.
            java.net.http.HttpHeaders upstreamHeaders = response.headers();

            byte[] rawBody = response.body() == null ? new byte[0] : response.body();

            // Defence in depth: `Accept-Encoding: identity` is a request, not a guarantee, and some
            // hosts compress unconditionally. The body is about to be decoded as UTF-8 text, so an
            // encoded payload must be expanded first or the caller receives mojibake.
            String contentEncoding = upstreamHeaders
                    .firstValue(HttpHeaders.CONTENT_ENCODING).orElse(null);
            rawBody = decodeBody(rawBody, contentEncoding, targetUrl);

            boolean truncated = rawBody.length > maxResponseBodyBytes;
            String responseBody = truncated
                    ? new String(rawBody, 0, maxResponseBodyBytes, StandardCharsets.UTF_8)
                    : new String(rawBody, StandardCharsets.UTF_8);

            String upstreamContentType = upstreamHeaders
                    .firstValue(HttpHeaders.CONTENT_TYPE).orElse(null);

            log.debug("Gateway {} {} -> {} in {}ms ({} bytes{})",
                    method, targetUrl, response.statusCode(), latencyMs,
                    rawBody.length, truncated ? ", truncated" : "");

            return new GatewayResponse(
                    response.statusCode(),
                    httpStatusText(response.statusCode()),
                    upstreamContentType,
                    responseBody,
                    latencyMs,
                    truncated
            );

        } catch (java.io.IOException ex) {
            long latencyMs = (System.nanoTime() - start) / 1_000_000L;
            log.warn("Gateway upstream I/O failure for {} {} after {}ms: {}",
                    method, targetUrl, latencyMs, ex.getMessage());
            throw new BadRequestException("The upstream API could not be reached");
        } catch (InterruptedException ex) {
            Thread.currentThread().interrupt();
            throw new BadRequestException("The upstream request was interrupted");
        }
    }

    /**
     * Expands a content-encoded upstream body so it can be handed to the caller as text.
     *
     * <p>The gateway asks for {@code Accept-Encoding: identity}, but a request header is only a
     * preference — some servers compress regardless. Because {@code GatewayResponse.body} is a String,
     * any unexpanded encoding would surface to the subscriber as garbage, so an encoded payload is
     * decoded here rather than being forwarded in a form the caller cannot use.</p>
     *
     * <p>Unrecognised or malformed encodings are passed through unchanged and logged: a body that
     * cannot be interpreted is still preferable to failing a request that the upstream answered
     * successfully. Only {@code gzip} and {@code deflate} are supported — the two the JDK can decode
     * without an additional dependency, and together the encodings that {@code identity} is requested
     * to avoid.</p>
     *
     * @param body            the raw upstream bytes
     * @param contentEncoding the upstream {@code Content-Encoding}, or {@code null}
     * @param targetUrl       used only for diagnostics
     * @return the decoded body, or {@code body} unchanged when no supported decoding applies
     */
    private byte[] decodeBody(byte[] body, String contentEncoding, String targetUrl) {
        if (body.length == 0 || contentEncoding == null || contentEncoding.isBlank()) {
            return body;
        }

        // A list is legal ("gzip, identity"); identity means no further transformation.
        String encoding = contentEncoding.trim().toLowerCase(java.util.Locale.ROOT);
        if (encoding.equals("identity")) {
            return body;
        }

        try {
            if (encoding.contains("gzip")) {
                return inflate(new java.util.zip.GZIPInputStream(new java.io.ByteArrayInputStream(body)));
            }
            if (encoding.contains("deflate")) {
                // Some servers send raw deflate with no zlib wrapper; try the wrapped form first and
                // fall back, because both are seen in the wild.
                try {
                    return inflate(new java.util.zip.InflaterInputStream(new java.io.ByteArrayInputStream(body)));
                } catch (java.io.IOException wrappedFailure) {
                    return inflate(new java.util.zip.InflaterInputStream(
                            new java.io.ByteArrayInputStream(body), new java.util.zip.Inflater(true)));
                }
            }
        } catch (java.io.IOException ex) {
            log.warn("Could not decode '{}' upstream body from {} — passing it through undecoded: {}",
                    contentEncoding, targetUrl, ex.getMessage());
            return body;
        }

        log.warn("Unsupported upstream Content-Encoding '{}' from {} — body forwarded as received",
                contentEncoding, targetUrl);
        return body;
    }

    /**
     * Reads an input stream fully, bounding the result so a decompression bomb cannot exhaust the heap.
     */
    private byte[] inflate(java.io.InputStream stream) throws java.io.IOException {
        try (stream; var out = new java.io.ByteArrayOutputStream()) {
            byte[] buffer = new byte[8192];
            int total = 0;
            int read;
            while ((read = stream.read(buffer)) != -1) {
                total += read;
                if (total > maxResponseBodyBytes) {
                    // Stop at the cap: the caller truncates anyway, so decoding further is wasted work.
                    break;
                }
                out.write(buffer, 0, read);
            }
            return out.toByteArray();
        }
    }

    /**
     * An empty publisher for methods that must not carry a body.
     */
    private java.net.http.HttpRequest.BodyPublisher bodyPublisher(HttpMethod method, String body) {
        if (body == null || body.isEmpty()
                || method == HttpMethod.GET || method == HttpMethod.HEAD) {
            return java.net.http.HttpRequest.BodyPublishers.noBody();
        }
        return java.net.http.HttpRequest.BodyPublishers.ofString(body, StandardCharsets.UTF_8);
    }

    /**
     * Maps a status code to its reason phrase, since the JDK client does not surface one.
     */
    private String httpStatusText(int statusCode) {
        return switch (statusCode) {
            case 200 -> "OK";
            case 201 -> "Created";
            case 202 -> "Accepted";
            case 204 -> "No Content";
            case 400 -> "Bad Request";
            case 401 -> "Unauthorized";
            case 403 -> "Forbidden";
            case 404 -> "Not Found";
            case 405 -> "Method Not Allowed";
            case 409 -> "Conflict";
            case 429 -> "Too Many Requests";
            case 500 -> "Internal Server Error";
            case 502 -> "Bad Gateway";
            case 503 -> "Service Unavailable";
            case 504 -> "Gateway Timeout";
            default -> String.valueOf(statusCode);
        };
    }
}
