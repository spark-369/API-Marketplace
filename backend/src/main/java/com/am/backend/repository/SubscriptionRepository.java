package com.am.backend.repository;

import com.am.backend.model.Subscription;
import com.am.backend.model.SubscriptionStatus;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Repository
public interface SubscriptionRepository extends JpaRepository<Subscription, UUID> {

    Optional<Subscription> findByUserIdAndApiId(UUID userId, UUID apiId);

    List<Subscription> findByUserId(UUID userId);

    Page<Subscription> findByUserId(UUID userId, Pageable pageable);

    List<Subscription> findByApiId(UUID apiId);

    Page<Subscription> findByApiId(UUID apiId, Pageable pageable);

    Optional<Subscription> findByIdAndApiId(UUID id, UUID apiId);

    boolean existsByUserId(UUID userId);

    boolean existsByPlanId(UUID planId);

    boolean existsByApiId(UUID apiId);

    /** Live subscriptions whose expiry instant has passed — used by the expiry sweep job. */
    @Query("""
            SELECT s FROM Subscription s
            WHERE s.status = :status AND s.expiresAt IS NOT NULL AND s.expiresAt < :now
            """)
    List<Subscription> findExpiredActive(@Param("status") SubscriptionStatus status,
                                         @Param("now") LocalDateTime now);
}
