package com.am.backend.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

import java.util.UUID;

/**
 * Payload for creating or updating an API ({@code POST/PUT /api/apis}`).
 *
 * <p>{@code slug} is optional on create (derived from {@code name} when omitted).</p>
 */
public record ApiRequest(

        @NotBlank(message = "Name is required")
        @Size(max = 180, message = "Name must be at most 180 characters")
        String name,

        @Size(max = 200, message = "Slug must be at most 200 characters")
        @Pattern(
                regexp = "^[a-z0-9]+(-[a-z0-9]+)*$",
                message = "Slug must be lower-case alphanumeric words separated by hyphens"
        )
        String slug,

        @Size(max = 4000, message = "Description must be at most 4000 characters")
        String description,

        @NotBlank(message = "Base URL is required")
        @Size(max = 700, message = "Base URL must be at most 700 characters")
        @Pattern(regexp = "^https?://.+$", message = "Base URL must be an absolute http(s) URL")
        String baseUrl,

        @Size(max = 700, message = "Documentation URL must be at most 700 characters")
        @Pattern(regexp = "^$|^https?://.+$", message = "Documentation URL must be an absolute http(s) URL")
        String documentationUrl,

        @Pattern(regexp = "DRAFT|PUBLISHED|ARCHIVED", message = "Status must be DRAFT, PUBLISHED or ARCHIVED")
        String status,

        @Pattern(regexp = "PUBLIC|PRIVATE", message = "Visibility must be PUBLIC or PRIVATE")
        String visibility,

        @Size(max = 40, message = "Version must be at most 40 characters")
        String version,

        UUID categoryId
) {
}
