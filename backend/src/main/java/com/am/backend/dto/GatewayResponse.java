package com.am.backend.dto;

/**
 * Response returned by the gateway after proxying a request upstream.
 *
 * @param status      HTTP status returned by the upstream API (4xx/5xx passed through verbatim)
 * @param statusText  reason phrase, when supplied by the upstream
 * @param contentType upstream {@code Content-Type}, when supplied
 * @param body        upstream response body as text (capped — see gateway max-body-bytes)
 * @param latencyMs   wall-clock duration of the upstream call
 * @param truncated   whether {@code body} was clipped to the configured maximum size
 */
public record GatewayResponse(
        int status,
        String statusText,
        String contentType,
        String body,
        long latencyMs,
        boolean truncated
) {
}
