package com.am.backend.service;

import com.am.backend.cache.CacheNames;
import com.am.backend.dto.ApiResponse;
import com.am.backend.exception.NotFoundException;
import com.am.backend.model.Api;
import com.am.backend.repository.ApiRepository;
import org.springframework.cache.annotation.Cacheable;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import java.util.UUID;

/**
 * Cache-backed reader for <em>publicly visible</em> APIs.
 *
 * <h2>Why this is a separate bean</h2>
 * Spring's {@code @Cacheable} is implemented with a proxy: a self-invocation inside
 * {@link ApiService} would bypass the proxy and silently skip the cache. Splitting this out makes the
 * caching semantics real rather than decorative.
 *
 * <h2>Why only public records</h2>
 * {@code ApiService.canView(...)} depends on the calling principal, but these cache entries are keyed
 * only by id/slug and carry no principal dimension. Caching a draft or private record would let one
 * caller's authorisation result be replayed to another — an anonymous request could then receive a
 * provider's draft with a 200, defeating the platform's 404-masking rule. Every read here therefore
 * re-asserts {@link Api#isPubliclyVisible()} and refuses to return (or cache) anything else.
 */
@Component
public class PublicApiCacheReader {

    private final ApiRepository apiRepository;

    public PublicApiCacheReader(ApiRepository apiRepository) {
        this.apiRepository = apiRepository;
    }

    /**
     * @param id the API id
     * @return the response for a publicly visible API
     * @throws NotFoundException when the API is absent or not publicly visible
     */
    @Transactional(readOnly = true)
    @Cacheable(cacheNames = CacheNames.API_CATALOG, key = "'id:' + #id")
    public ApiResponse byId(UUID id) {
        return toPublicResponse(apiRepository.findById(id)
                .orElseThrow(() -> new NotFoundException("API not found")));
    }

    /**
     * @param slug the API slug
     * @return the response for a publicly visible API
     * @throws NotFoundException when the API is absent or not publicly visible
     */
    @Transactional(readOnly = true)
    @Cacheable(cacheNames = CacheNames.API_CATALOG, key = "'slug:' + #slug")
    public ApiResponse bySlug(String slug) {
        return toPublicResponse(apiRepository.findBySlug(slug)
                .orElseThrow(() -> new NotFoundException("API not found")));
    }

    private ApiResponse toPublicResponse(Api api) {
        if (!api.isPubliclyVisible()) {
            // Never cache a non-public payload, even if a race changed the record between reads.
            throw new NotFoundException("API not found");
        }
        return ApiResponse.from(api);
    }
}
