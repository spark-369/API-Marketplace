package com.am.backend.dto;

import com.am.backend.model.Role;
import com.am.backend.model.User;

import java.time.LocalDateTime;
import java.util.UUID;

/**
 * Authentication result returned by register/login.
 *
 * @param accessToken signed JWT to be sent as {@code Authorization: Bearer <token>}
 * @param tokenType   always {@code Bearer}
 */
public record AuthResponse(
        String accessToken,
        String tokenType,
        UUID id,
        String email,
        String firstName,
        String lastName,
        Role role,
        LocalDateTime createdAt
) {

    public static AuthResponse of(String token, User user) {
        return new AuthResponse(
                token,
                "Bearer",
                user.getId(),
                user.getEmail(),
                user.getFirstName(),
                user.getLastName(),
                user.getRole(),
                user.getCreatedAt()
        );
    }
}
