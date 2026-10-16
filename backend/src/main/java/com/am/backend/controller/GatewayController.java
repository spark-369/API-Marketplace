package com.am.backend.controller;

import com.am.backend.dto.GatewayResponse;
import com.am.backend.model.Api;
import com.am.backend.service.ApiKeyService;
import com.am.backend.service.GatewayService;
import com.am.backend.service.UsageLogService;
import com.am.backend.ratelimit.RateLimitDecision;
import com.am.backend.ratelimit.RateLimitService;
import com.am.backend.exception.RateLimitExceededException;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.servlet.http.HttpServletRequest;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.UUID;

/**
 * Gateway proxy.
 *
 * <p>Authentication here is application-level: {@code X-API-Key} rather than a JWT, because the
 * caller in this path is a customer's server, not a browser session. The route is on the security
 * allow-list and the key is validated by {@code ApiKeyService}.</p>
 *
 * <h2>Request pipeline</h2>
 * <ol>
 *   <li>Validate the key against the API in the path.</li>
 *   <li>Consume rate-limit quota in Redis; reject with 429 when exhausted.</li>
 *   <li>Forward to the upstream API (SSRF-validated).</li>
 *   <li>Persist telemetry for the attempt (synchronously, in its own transaction).</li>
 *   <li>Return the upstream response verbatim.</li>
 * </ol>
 */
@RestController
@RequestMapping("/api/gateway")
@Tag(name = "Gateway", description = "Runtime proxy for subscribed APIs")
public class GatewayController {

    private static final Logger log = LoggerFactory.getLogger(GatewayController.class);

    private final ApiKeyService apiKeyService;
    private final GatewayService gatewayService;
    private final RateLimitService rateLimitService;
    private final UsageLogService usageLogService;

    public GatewayController(ApiKeyService apiKeyService,
                             GatewayService gatewayService,
                             RateLimitService rateLimitService,
                             UsageLogService usageLogService) {
        this.apiKeyService = apiKeyService;
        this.gatewayService = gatewayService;
        this.rateLimitService = rateLimitService;
        this.usageLogService = usageLogService;
    }

    /**
     * Forwards a request to the upstream API identified by {@code apiId}.
     *
     * <p>The trailing path segment is optional, so {@code /forward/{apiId}} targets the base URL
     * itself while {@code /forward/{apiId}/v1/weather} appends a sub-path.</p>
     *
     * @param apiId       the target API
     * @param path        optional sub-path
     * @param apiKey      the {@code X-API-Key} credential
     * @param body        optional request body, forwarded for write methods
     * @param contentType the inbound content type
     * @param request     raw request, used for client IP and user agent telemetry
     */
    @RequestMapping("/forward/{apiId}/**")
    @Operation(summary = "Forward a request to an upstream API",
            description = "Requires X-API-Key. Returns the upstream response verbatim, "
                    + "or 429 with Retry-After when the plan quota is exhausted.")
    public ResponseEntity<GatewayResponse> forward(
            @PathVariable UUID apiId,
            @RequestHeader(value = "X-API-Key", required = false) String apiKey,
            @RequestHeader(value = HttpHeaders.CONTENT_TYPE, required = false) String contentType,
            @RequestBody(required = false) String body,
            HttpServletRequest request) {

        HttpMethod method = HttpMethod.valueOf(request.getMethod());

        // 1. Authenticate the key against this specific API.
        ApiKeyService.ValidatedKey validated = apiKeyService.validateApiKeyForApi(apiKey, apiId);

        // 2. Enforce the plan quota before touching the upstream.
        RateLimitDecision decision = rateLimitService.consume(
                validated.keyId().toString(), validated.limit(), validated.windowSeconds());
        if (!decision.allowed()) {
            throw new RateLimitExceededException(
                    "Rate limit exceeded for this plan: " + decision.limit()
                            + " requests per " + decision.windowSeconds() + "s",
                    decision.retryAfterSeconds(),
                    decision.limit(),
                    decision.windowSeconds());
        }

        // 3. Forward, capturing latency and the upstream status.
        Api api = gatewayService.requireApi(apiId);
        String subPath = extractSubPath(request, apiId);

        GatewayResponse response;
        try {
            response = gatewayService.forward(
                    api, subPath, method, body, contentType, extractForwardedHeaders(request));
        } catch (RuntimeException upstreamFailure) {
            // A transport/validation failure still represents real traffic against this key: record it
            // so the table reflects attempts, not just successful upstream round-trips. The request is
            // then rethrown so the caller still receives the platform error.
            recordTelemetryForFailure(validated.keyId(), request, upstreamFailure);
            throw upstreamFailure;
        }

        // 4. Record telemetry for the attempt; non-fatal, in its own transaction.
        persistTelemetry(validated.keyId(), request, response);

        // 5. Return the upstream response as-is.
        return ResponseEntity.status(response.status()).body(response);
    }

    /**
     * Records a telemetry row for a request that failed before an upstream response was obtained.
     *
     * <p>{@link #persistTelemetry} needs a {@code GatewayResponse} to carry the upstream status and
     * latency; a failed forward has neither. The failure is recorded with a synthetic {@code 502}
     * (Bad Gateway) status and zero latency so the row still lands in {@code usage_logs} and the
     * failure is inspectable, while the original exception is rethrown to preserve the caller-facing
     * contract.</p>
     */
    private void recordTelemetryForFailure(UUID apiKeyId, HttpServletRequest request, RuntimeException failure) {
        try {
            persistTelemetry(apiKeyId, request,
                    new GatewayResponse(502, null, null, null, 0L, false));
        } catch (RuntimeException persistFailure) {
            // Telemetry must never mask the original upstream failure.
            log.warn("Unable to record failure telemetry for key {}: {}", apiKeyId, persistFailure.getMessage());
        }
        log.debug("Recorded failed gateway request for key {} ({})", apiKeyId, failure.toString());
    }

    /**
     * Extracts the sub-path following {@code /forward/{apiId}} from the raw request URI.
     *
     * <p>Read from the URI rather than a {@code @PathVariable} wildcard so that encoded segments
     * survive intact.</p>
     */
    private String extractSubPath(HttpServletRequest request, UUID apiId) {
        String uri = request.getRequestURI();
        String marker = "/forward/" + apiId;
        int index = uri.indexOf(marker);
        if (index < 0) {
            return "";
        }
        String remainder = uri.substring(index + marker.length());
        return remainder.startsWith("/") ? remainder.substring(1) : remainder;
    }

    /**
     * Copies the inbound headers that are safe to relay, dropping hop-by-hop and identity headers.
     *
     * <p>Client-supplied {@code X-Forwarded-For} is dropped here rather than upstream, so a caller
     * cannot spoof its origin to the provider.</p>
     */
    private HttpHeaders extractForwardedHeaders(HttpServletRequest request) {
        HttpHeaders headers = new HttpHeaders();
        request.getHeaderNames().asIterator().forEachRemaining(name -> {
            String lower = name.toLowerCase();
            if (gatewayService.getHopByHopHeaders().contains(lower)
                    || lower.equals("x-forwarded-for")
                    || lower.equals("x-forwarded-host")
                    || lower.equals("x-forwarded-proto")) {
                return;
            }
            request.getHeaders(name).asIterator().forEachRemaining(value -> headers.add(name, value));
        });
        return headers;
    }

    /**
     * Persists telemetry for one gateway request.
     *
     * <p><strong>Why this is synchronous.</strong> Telemetry was previously enqueued as a JobRunr
     * background job. That job never persisted a row in practice: it was the only non-{@code @Recurring}
     * job, enqueued from the request thread as a lambda that captured a Spring-proxied bean and a
     * non-serialisable payload. JobRunr could not represent that reliably, the surrounding catch
     * swallowed the failure, and {@code usage_logs} stayed empty while every recurring job worked
     * normally.</p>
     *
     * <p>Writing directly removes that dependency entirely. {@link UsageLogService#persist} is
     * {@code REQUIRES_NEW} and swallows its own failures, so it runs in a short, independent
     * transaction that can neither join nor roll back the request's, and can never fail the
     * customer's call — the response is still returned as-is. The method name is kept distinct from
     * the service call so the intent (record the attempt, non-fatally) stays obvious.</p>
     */
    private void persistTelemetry(UUID apiKeyId, HttpServletRequest request, GatewayResponse response) {
        UsageLogService.UsageLogPayload payload = new UsageLogService.UsageLogPayload(
                apiKeyId,
                request.getRequestURI(),
                request.getMethod(),
                response.status(),
                response.latencyMs(),
                clientIp(request),
                request.getHeader(HttpHeaders.USER_AGENT)
        );
        usageLogService.persist(payload);
    }

    /**
     * Resolves the originating client address, honouring the first hop of
     * {@code X-Forwarded-For} when the platform itself sits behind a trusted load balancer.
     */
    private String clientIp(HttpServletRequest request) {
        String forwarded = request.getHeader("X-Forwarded-For");
        if (forwarded != null && !forwarded.isBlank()) {
            int comma = forwarded.indexOf(',');
            return comma > 0 ? forwarded.substring(0, comma).trim() : forwarded.trim();
        }
        return request.getRemoteAddr();
    }
}
