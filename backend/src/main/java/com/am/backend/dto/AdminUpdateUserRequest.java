package com.am.backend.dto;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

/**
 * Admin payload for {@code PUT /api/users/{id}}.
 *
 * <p>{@code password} is optional: when blank the existing credential is left untouched.</p>
 */
public record AdminUpdateUserRequest(

        @Email(message = "Email must be a valid address")
        @Size(max = 180, message = "Email must be at most 180 characters")
        String email,

        @Size(min = 8, max = 100, message = "Password must be between 8 and 100 characters")
        @Pattern(
                regexp = "^(?=.*[A-Za-z])(?=.*\\d).+$",
                message = "Password must contain at least one letter and one digit"
        )
        String password,

        @Size(max = 80, message = "First name must be at most 80 characters")
        String firstName,

        @Size(max = 80, message = "Last name must be at most 80 characters")
        String lastName,

        @Pattern(regexp = "ADMIN|PROVIDER|DEVELOPER", message = "Invalid role")
        String role,

        @Size(max = 1000, message = "Bio must be at most 1000 characters")
        String bio,

        @Size(max = 500, message = "Avatar URL must be at most 500 characters")
        String avatarUrl
) {
}
