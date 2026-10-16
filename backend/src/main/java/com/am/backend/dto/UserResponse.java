package com.am.backend.dto;

import com.am.backend.model.Role;
import com.am.backend.model.User;

import java.time.LocalDateTime;
import java.util.UUID;

/**
 * Read model for a user account. Never includes the password hash.
 */
public record UserResponse(
        UUID id,
        String email,
        String firstName,
        String lastName,
        String fullName,
        Role role,
        String bio,
        String avatarUrl,
        LocalDateTime createdAt,
        LocalDateTime updatedAt
) {

    public static UserResponse from(User user) {
        return new UserResponse(
                user.getId(),
                user.getEmail(),
                user.getFirstName(),
                user.getLastName(),
                user.getFullName(),
                user.getRole(),
                user.getBio(),
                user.getAvatarUrl(),
                user.getCreatedAt(),
                user.getUpdatedAt()
        );
    }
}
