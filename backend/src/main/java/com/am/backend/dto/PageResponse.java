package com.am.backend.dto;

import org.springframework.data.domain.Page;

import java.util.List;
import java.util.function.Function;

/**
 * Serialisable representation of a Spring Data {@link Page}.
 *
 * <p>Spring's {@code Page} serialises with an unstable shape (and warns about it), so every
 * paginated endpoint returns this envelope instead: {@code content} plus explicit paging metadata.</p>
 *
 * @param <T> element type of {@link #content}
 */
public record PageResponse<T>(
        List<T> content,
        int page,
        int size,
        long totalElements,
        int totalPages,
        boolean first,
        boolean last,
        boolean empty
) {

    /** Wraps an entity page, mapping each element through {@code mapper}. */
    public static <E, T> PageResponse<T> from(Page<E> page, Function<E, T> mapper) {
        return new PageResponse<>(
                page.getContent().stream().map(mapper).toList(),
                page.getNumber(),
                page.getSize(),
                page.getTotalElements(),
                page.getTotalPages(),
                page.isFirst(),
                page.isLast(),
                page.isEmpty()
        );
    }

    /** Wraps a page whose elements are already DTOs. */
    public static <T> PageResponse<T> from(Page<T> page) {
        return from(page, Function.identity());
    }
}
