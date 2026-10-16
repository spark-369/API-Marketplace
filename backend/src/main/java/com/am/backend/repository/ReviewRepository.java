package com.am.backend.repository;

import com.am.backend.model.Review;
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
public interface ReviewRepository extends JpaRepository<Review, UUID> {

    List<Review> findByApiId(UUID apiId);

    Page<Review> findByApiId(UUID apiId, Pageable pageable);

    Optional<Review> findByApiIdAndUserId(UUID apiId, UUID userId);

    Optional<Review> findByIdAndApiId(UUID id, UUID apiId);

    boolean existsByApiIdAndUserId(UUID apiId, UUID userId);

    boolean existsByUserId(UUID userId);

    long countByApiId(UUID apiId);

    /** Average of all ratings for an API, or {@code null} when there are none. */
    @Query("SELECT AVG(r.rating) FROM Review r WHERE r.api.id = :apiId")
    Double averageRatingForApi(@Param("apiId") UUID apiId);
}
