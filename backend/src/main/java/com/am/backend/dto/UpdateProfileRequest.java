package com.am.backend.dto;

import jakarta.validation.constraints.Size;

/**
 * Payload for updating the authenticated user's own profile
 * ({@code PUT /api/users/me}). All fields are optional; {@code null} means "leave unchanged".
 */
public record UpdateProfileRequest(

        @Size(max = 80, message = "First name must be at most 80 characters")
        String firstName,

        @Size(max = 80, message = "Last name must be at most 80 characters")
        String lastName,

        @Size(max = 1000, message = "Bio must be at most 1000 characters")
        String bio,

        @Size(max = 500, message = "Avatar URL must be at most 500 characters")
        String avatarUrl
) {
}
