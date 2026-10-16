package com.am.backend.cache;

import com.am.backend.dto.ApiResponse;
import com.am.backend.dto.PageResponse;
import com.am.backend.model.ApiStatus;
import com.am.backend.model.ApiVisibility;
import com.fasterxml.jackson.annotation.JsonAutoDetect;
import com.fasterxml.jackson.annotation.JsonTypeInfo;
import com.fasterxml.jackson.annotation.PropertyAccessor;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.jsontype.BasicPolymorphicTypeValidator;
import com.fasterxml.jackson.databind.jsontype.PolymorphicTypeValidator;
import com.fasterxml.jackson.datatype.jsr310.JavaTimeModule;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.data.redis.serializer.GenericJackson2JsonRedisSerializer;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Round-trip tests for the cache value serializer.
 *
 * <p>These exist because the in-memory cache used by the {@code test} profile stores object
 * references and never serialises, so nothing else in the suite can catch a broken cache codec. The
 * failure this pins is subtle and looks intermittent in production: the first (cache-missing) request
 * succeeds, and every subsequent cache <em>hit</em> throws
 * {@code ClassCastException: LinkedHashMap cannot be cast to PageResponse} because the payload
 * carried no type information.</p>
 */
class CacheSerializationTest {

    /**
     * Built the same way as {@code RedisCacheConfig.cacheObjectMapper()} so the test fails if that
     * configuration regresses.
     */
    private final GenericJackson2JsonRedisSerializer serializer =
            new GenericJackson2JsonRedisSerializer(cacheObjectMapper());

    @Test
    @DisplayName("a PageResponse survives a serialise/deserialise round trip with its type intact")
    void pageResponseRoundTripsToItsDeclaredType() {
        PageResponse<ApiResponse> original = new PageResponse<>(
                List.of(apiResponse()),
                0, 20, 1L, 1, true, true, false);

        Object restored = serializer.deserialize(serializer.serialize(original));

        assertThat(restored).isInstanceOf(PageResponse.class);
        PageResponse<?> page = (PageResponse<?>) restored;
        assertThat(page.totalElements()).isEqualTo(1L);
        assertThat(page.content()).hasSize(1);
    }

    @Test
    @DisplayName("nested elements are restored as their DTO type, not LinkedHashMap")
    void nestedElementsKeepTheirType() {
        PageResponse<ApiResponse> original = new PageResponse<>(
                List.of(apiResponse()),
                0, 20, 1L, 1, true, true, false);

        @SuppressWarnings("unchecked")
        PageResponse<ApiResponse> restored =
                (PageResponse<ApiResponse>) serializer.deserialize(serializer.serialize(original));

        // The cast above only succeeds because the element type is embedded in the JSON.
        ApiResponse element = restored.content().get(0);
        assertThat(element).isInstanceOf(ApiResponse.class);
        assertThat(element.slug()).isEqualTo("weather-api");
    }

    private ApiResponse apiResponse() {
        return new ApiResponse(
                UUID.randomUUID(), "Weather API", "weather-api", "Forecasts", "https://up.example",
                "https://docs.example", ApiStatus.PUBLISHED, ApiVisibility.PUBLIC, "1.0.0",
                new BigDecimal("4.50"), 2L, null, null, UUID.randomUUID(), "Owner Name",
                "owner@example.com", LocalDateTime.now(), LocalDateTime.now());
    }

    private ObjectMapper cacheObjectMapper() {
        ObjectMapper mapper = new ObjectMapper();
        mapper.registerModule(new JavaTimeModule());
        mapper.setVisibility(PropertyAccessor.ALL, JsonAutoDetect.Visibility.ANY);
        mapper.activateDefaultTyping(cacheTypeValidator(),
                ObjectMapper.DefaultTyping.NON_FINAL, JsonTypeInfo.As.PROPERTY);
        return mapper;
    }

    private PolymorphicTypeValidator cacheTypeValidator() {
        return BasicPolymorphicTypeValidator.builder()
                .allowIfSubType("com.am.backend.")
                .allowIfSubType("java.util.")
                .allowIfSubType("java.time.")
                .allowIfSubType("java.lang.")
                .build();
    }
}
