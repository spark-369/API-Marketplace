package com.am.backend.dto;

import com.am.backend.model.Plan;
import com.am.backend.model.RatePeriod;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.UUID;

/**
 * Read model for a plan.
 */
public record PlanResponse(
        UUID id,
        String name,
        String description,
        BigDecimal price,
        boolean free,
        int rateLimit,
        RatePeriod ratePeriod,
        String supportLevel,
        UUID apiId,
        String apiName,
        LocalDateTime createdAt,
        LocalDateTime updatedAt
) {

    public static PlanResponse from(Plan plan) {
        return new PlanResponse(
                plan.getId(),
                plan.getName(),
                plan.getDescription(),
                plan.getPrice(),
                plan.isFree(),
                plan.getRateLimit(),
                plan.getRatePeriod(),
                plan.getSupportLevel(),
                plan.getApi().getId(),
                plan.getApi().getName(),
                plan.getCreatedAt(),
                plan.getUpdatedAt()
        );
    }
}
