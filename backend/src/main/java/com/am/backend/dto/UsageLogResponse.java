package com.am.backend.dto;

import com.am.backend.model.UsageLog;

import java.time.LocalDateTime;
import java.util.UUID;

/**
 * Read model for a single gateway telemetry record.
 */
public record UsageLogResponse(
        UUID id,
        UUID apiKeyId,
        String keyPrefix,
        UUID apiId,
        String apiName,
        String endpoint,
        String method,
        int statusCode,
        long latencyMs,
        String ipAddress,
        String userAgent,
        LocalDateTime createdAt
) {

    public static UsageLogResponse from(UsageLog log) {
        var key = log.getApiKey();
        return new UsageLogResponse(
                log.getId(),
                key.getId(),
                key.getKeyPrefix(),
                key.getApi().getId(),
                key.getApi().getName(),
                log.getEndpoint(),
                log.getMethod(),
                log.getStatusCode(),
                log.getLatencyMs(),
                log.getIpAddress(),
                log.getUserAgent(),
                log.getCreatedAt()
        );
    }
}
