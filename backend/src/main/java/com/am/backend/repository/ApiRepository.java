package com.am.backend.repository;

import com.am.backend.model.Api;
import com.am.backend.model.ApiStatus;
import com.am.backend.model.ApiVisibility;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Repository
public interface ApiRepository extends JpaRepository<Api, UUID> {

    Optional<Api> findBySlug(String slug);

    boolean existsBySlug(String slug);

    List<Api> findByOwnerId(UUID ownerId);

    Page<Api> findByOwnerId(UUID ownerId, Pageable pageable);

    List<Api> findByCategoryId(UUID categoryId);

    boolean existsByCategoryId(UUID categoryId);

    long countByOwnerId(UUID ownerId);

    /** Public catalog listing: PUBLISHED and not PRIVATE. */
    @Query("""
            SELECT a FROM Api a
            WHERE a.status = :status AND a.visibility <> :hidden
            """)
    Page<Api> findPublicCatalog(@Param("status") ApiStatus status,
                                @Param("hidden") ApiVisibility hidden,
                                Pageable pageable);

    /** Public catalog listing narrowed by category. */
    @Query("""
            SELECT a FROM Api a
            WHERE a.status = :status AND a.visibility <> :hidden AND a.category.id = :categoryId
            """)
    Page<Api> findPublicCatalogByCategory(@Param("status") ApiStatus status,
                                          @Param("hidden") ApiVisibility hidden,
                                          @Param("categoryId") UUID categoryId,
                                          Pageable pageable);

    /** Free-text search across name and description for the public catalog. */
    @Query("""
            SELECT a FROM Api a
            WHERE a.status = :status AND a.visibility <> :hidden
              AND (LOWER(a.name) LIKE LOWER(CONCAT('%', :term, '%'))
                   OR LOWER(a.description) LIKE LOWER(CONCAT('%', :term, '%')))
            """)
    Page<Api> searchPublicCatalog(@Param("status") ApiStatus status,
                                  @Param("hidden") ApiVisibility hidden,
                                  @Param("term") String term,
                                  Pageable pageable);
}
