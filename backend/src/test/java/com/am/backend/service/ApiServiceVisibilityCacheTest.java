package com.am.backend.service;

import com.am.backend.exception.NotFoundException;
import com.am.backend.model.Api;
import com.am.backend.model.ApiStatus;
import com.am.backend.model.ApiVisibility;
import com.am.backend.model.Role;
import com.am.backend.model.User;
import com.am.backend.repository.ApiKeyRepository;
import com.am.backend.repository.ApiRepository;
import com.am.backend.repository.CategoryRepository;
import com.am.backend.repository.PlanRepository;
import com.am.backend.repository.ReviewRepository;
import com.am.backend.repository.SubscriptionRepository;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;

import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

/**
 * Regression tests for the platform's 404-masking rule under caching.
 *
 * <p>The {@code apiCatalog} cache is keyed only by id/slug and carries no principal dimension. An
 * earlier implementation annotated {@code ApiService.getApi(...)} itself as {@code @Cacheable}, which
 * meant the first caller's authorisation result was stored and replayed to every subsequent caller:
 * a provider reading their own draft populated the entry, and an anonymous request then received
 * that draft with a 200. These tests pin the corrected behaviour — only publicly visible APIs are
 * cacheable, and non-public reads are always masked as 404 regardless of who saw what first.</p>
 */
class ApiServiceVisibilityCacheTest {

    private final ApiRepository apiRepository = mock(ApiRepository.class);

    @Nested
    @DisplayName("getApi(UUID)")
    class GetApi {

        @Test
        void returnsPublicApiToAnonymousCaller() {
            UUID id = UUID.randomUUID();
            when(apiRepository.findById(id))
                    .thenReturn(Optional.of(api(id, ApiStatus.PUBLISHED, ApiVisibility.PUBLIC)));

            ApiService service = newApiService();

            try (var ignored = anonymous()) {
                assertThat(service.getApi(id).id()).isEqualTo(id);
            }
        }

        @Test
        void returnsDraftToItsOwnProvider() {
            UUID id = UUID.randomUUID();
            User owner = user(Role.PROVIDER);
            Api draft = api(id, ApiStatus.DRAFT, ApiVisibility.PRIVATE);
            draft.setOwner(owner);
            when(apiRepository.findById(id)).thenReturn(Optional.of(draft));

            ApiService service = newApiService();

            try (var ignored = authenticatedAs(owner)) {
                assertThat(service.getApi(id).id()).isEqualTo(id);
            }
        }

        @Test
        void neverServesADraftToAnAnonymousCallerEvenAfterTheOwnerReadIt() {
            UUID id = UUID.randomUUID();
            User owner = user(Role.PROVIDER);
            Api draft = api(id, ApiStatus.DRAFT, ApiVisibility.PRIVATE);
            draft.setOwner(owner);
            when(apiRepository.findById(id)).thenReturn(Optional.of(draft));

            ApiService service = newApiService();

            // The owner's read is authorised and must not poison any shared cache entry.
            try (var ignored = authenticatedAs(owner)) {
                assertThat(service.getApi(id).id()).isEqualTo(id);
            }

            // An anonymous caller must still see a masked 404, not the cached draft.
            try (var ignored = anonymous()) {
                assertThatThrownBy(() -> service.getApi(id))
                        .isInstanceOf(NotFoundException.class)
                        .hasMessage("API not found");
            }
        }

        @Test
        void masksANonExistentApiAs404() {
            UUID id = UUID.randomUUID();
            when(apiRepository.findById(id)).thenReturn(Optional.empty());

            ApiService service = newApiService();

            try (var ignored = anonymous()) {
                assertThatThrownBy(() -> service.getApi(id))
                        .isInstanceOf(NotFoundException.class);
            }
        }
    }

    @Nested
    @DisplayName("getApiBySlug(String)")
    class GetApiBySlug {

        @Test
        void neverServesAPrivateApiToAnAnonymousCaller() {
            User owner = user(Role.PROVIDER);
            Api privateApi = api(UUID.randomUUID(), ApiStatus.PUBLISHED, ApiVisibility.PRIVATE);
            privateApi.setSlug("internal-tool");
            privateApi.setOwner(owner);
            when(apiRepository.findBySlug("internal-tool")).thenReturn(Optional.of(privateApi));

            ApiService service = newApiService();

            try (var ignored = authenticatedAs(owner)) {
                assertThat(service.getApiBySlug("internal-tool").slug()).isEqualTo("internal-tool");
            }

            try (var ignored = anonymous()) {
                assertThatThrownBy(() -> service.getApiBySlug("internal-tool"))
                        .isInstanceOf(NotFoundException.class)
                        .hasMessage("API not found");
            }
        }
    }

    // ---- Fixtures ----------------------------------------------------------

    private ApiService newApiService() {
        return new ApiService(apiRepository,
                mock(CategoryRepository.class),
                mock(PlanRepository.class),
                mock(ApiKeyRepository.class),
                mock(ReviewRepository.class),
                mock(SubscriptionRepository.class),
                new PublicApiCacheReader(apiRepository));
    }

    /**
     * Minimal {@link Api} for visibility assertions.
     *
     * <p>The owner is given a real id rather than being left null: {@code ApiService.canView(...)}
     * reaches {@code user.getId().equals(api.getOwner().getId())} whenever the API is not publicly
     * visible, so an owner without an id would only be safe for the tests that short-circuit on
     * {@code isPubliclyVisible()} — and would silently misbehave for any test added later that
     * exercises the ownership branch.</p>
     */
    private Api api(UUID id, ApiStatus status, ApiVisibility visibility) {
        Api api = new Api();
        api.setId(id);
        api.setName("Test API");
        api.setSlug("test-api");
        api.setStatus(status);
        api.setVisibility(visibility);
        api.setOwner(new User());
        api.getOwner().setId(UUID.randomUUID());
        api.getOwner().setEmail("owner@example.com");
        return api;
    }

    private User user(Role role) {
        User user = new User();
        user.setId(UUID.randomUUID());
        user.setEmail(role.name().toLowerCase() + "@example.com");
        user.setRole(role);
        return user;
    }

    /**
     * Installs {@code user} as the authenticated principal and returns a resource that clears the
     * context when the enclosing try-with-resources block exits.
     *
     * <p>Returns {@link ScopeCleanup} rather than a bare {@link AutoCloseable}: the resource type
     * must be an {@code AutoCloseable} subtype, but {@code AutoCloseable.close()} declares
     * {@code throws Exception}, which would force a try/catch at every call site. See
     * {@link ScopeCleanup} for the full reasoning.</p>
     */
    private ScopeCleanup authenticatedAs(User user) {
        SecurityContextHolder.getContext().setAuthentication(
                new UsernamePasswordAuthenticationToken(user, null, user.getAuthorities()));
        return ScopeCleanup.after(SecurityContextHolder::clearContext);
    }

    /**
     * Clears any authenticated principal and returns a resource that clears it again on exit.
     */
    private ScopeCleanup anonymous() {
        SecurityContextHolder.clearContext();
        return ScopeCleanup.after(SecurityContextHolder::clearContext);
    }
}
