package com.am.backend.model;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Unit tests for account entities: role defaults, authority mapping and {@link BaseEntity} identity.
 */
class UserAndIdentityTest {

    @Nested
    @DisplayName("User")
    class UserAccount {

        @Test
        void defaultsToDeveloperRole() {
            assertThat(new User().getRole()).isEqualTo(Role.DEVELOPER);
        }

        @Test
        void rolePredicatesReflectTheAssignedRole() {
            User admin = new User("a@b.com", "x", "A", "B", Role.ADMIN);

            assertThat(admin.isAdmin()).isTrue();
            assertThat(admin.isProvider()).isFalse();
            assertThat(admin.isDeveloper()).isFalse();
        }

        @Test
        void authorityIsPrefixedWithRole() {
            User provider = new User("p@b.com", "x", "P", "B", Role.PROVIDER);

            assertThat(provider.getAuthorities())
                    .extracting(Object::toString)
                    .containsExactly("ROLE_PROVIDER");
        }

        @Test
        void usernameIsTheEmailAddress() {
            User user = new User("dev@example.com", "x", "D", "E", Role.DEVELOPER);

            assertThat(user.getUsername()).isEqualTo("dev@example.com");
        }

        @Test
        void fullNameJoinsTheNameParts() {
            User user = new User("x@y.com", "x", "Ada", "Lovelace", Role.DEVELOPER);

            assertThat(user.getFullName()).isEqualTo("Ada Lovelace");
        }

        @Test
        void accountFlagsAreAllPermissive() {
            User user = new User("x@y.com", "x", "A", "B", Role.DEVELOPER);

            assertThat(user.isAccountNonExpired()).isTrue();
            assertThat(user.isAccountNonLocked()).isTrue();
            assertThat(user.isCredentialsNonExpired()).isTrue();
            assertThat(user.isEnabled()).isTrue();
        }
    }

    @Nested
    @DisplayName("BaseEntity identity")
    class EntityIdentity {

        @Test
        void transientEntitiesAreDistinct() {
            Api first = new Api();
            Api second = new Api();

            // Identity semantics for unsaved rows: distinct instances must not collide.
            assertThat(first).isNotEqualTo(second);
            assertThat(first.equals(first)).isTrue();
        }

        @Test
        void entitiesSharingAnIdAreEqual() {
            java.util.UUID id = java.util.UUID.randomUUID();
            Api first = new Api();
            Api second = new Api();
            first.setId(id);
            second.setId(id);

            assertThat(first).isEqualTo(second);
            assertThat(first).hasSameHashCodeAs(second);
        }

        @Test
        void differentEntityTypesAreNeverEqual() {
            java.util.UUID id = java.util.UUID.randomUUID();
            Api api = new Api();
            Category category = new Category();
            api.setId(id);
            category.setId(id);

            assertThat(api).isNotEqualTo(category);
        }

        @Test
        void transientEntityIsNotEqualToNull() {
            assertThat(new Api()).isNotEqualTo(null);
        }
    }
}
