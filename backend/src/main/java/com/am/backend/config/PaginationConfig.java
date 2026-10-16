package com.am.backend.config;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.data.web.config.PageableHandlerMethodArgumentResolverCustomizer;

/**
 * Pagination guard rails.
 *
 * <p>Without a ceiling, {@code ?size=1000000} is a cheap way for any caller — including an anonymous
 * one hitting the public catalog — to ask the database for the entire table. Spring Data's default
 * of 2000 is still far too generous for this domain, so the maximum is clamped to a configured
 * value and every listing endpoint inherits it.</p>
 */
@Configuration
public class PaginationConfig {

    /**
     * Hard ceiling applied to every {@code Pageable} resolved by Spring Data Web.
     */
    @Value("${app.pagination.max-page-size:100}")
    private int maxPageSize;

    @Bean
    public PageableHandlerMethodArgumentResolverCustomizer pageableCustomizer() {
        return resolver -> {
            resolver.setMaxPageSize(maxPageSize);
            resolver.setOneIndexedParameters(false);
        };
    }
}
