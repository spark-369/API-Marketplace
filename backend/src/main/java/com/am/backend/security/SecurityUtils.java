package com.am.backend.security;

import com.am.backend.exception.UnauthorizedException;
import com.am.backend.model.Role;
import com.am.backend.model.User;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;

import java.util.Optional;
import java.util.UUID;

/**
 * Small helper for reading the authenticated principal and expressing ownership rules
 * consistently across services and controllers.
 */
public final class SecurityUtils {

    private SecurityUtils() {
    }

    /**
     * @return the authenticated {@link User}, or empty when the request is anonymous.
     */
    public static Optional<User> currentUser() {
        Authentication authentication = SecurityContextHolder.getContext().getAuthentication();
        if (authentication == null || !authentication.isAuthenticated()) {
            return Optional.empty();
        }
        Object principal = authentication.getPrincipal();
        return principal instanceof User user ? Optional.of(user) : Optional.empty();
    }

    /**
     * @return the authenticated user; throws when the request is anonymous.
     */
    public static User requireCurrentUser() {
        return currentUser().orElseThrow(() -> new UnauthorizedException("Authentication required"));
    }

    public static UUID requireCurrentUserId() {
        return requireCurrentUser().getId();
    }

    public static boolean isAuthenticated() {
        return currentUser().isPresent();
    }

    public static boolean isAdmin() {
        return currentUser().map(User::isAdmin).orElse(false);
    }

    public static boolean hasRole(Role role) {
        return currentUser().map(user -> user.getRole() == role).orElse(false);
    }

    /**
     * Ownership predicate used by every provider-scoped operation.
     *
     * @param ownerId the user id owning the resource
     * @return {@code true} for the owner himself or any admin
     */
    public static boolean canManage(UUID ownerId) {
        return currentUser()
                .map(user -> user.isAdmin() || user.getId().equals(ownerId))
                .orElse(false);
    }

    /**
     * Asserts that the current principal owns the resource or is an admin.
     *
     * @throws org.springframework.security.access.AccessDeniedException when neither holds
     */
    public static void assertCanManage(UUID ownerId, String resourceDescription) {
        if (!canManage(ownerId)) {
            throw new org.springframework.security.access.AccessDeniedException(
                    "You do not have permission to manage this " + resourceDescription);
        }
    }
}
