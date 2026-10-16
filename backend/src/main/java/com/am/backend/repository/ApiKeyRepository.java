package com.am.backend.repository;

import com.am.backend.model.ApiKey;
import com.am.backend.model.ApiKeyStatus;
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
public interface ApiKeyRepository extends JpaRepository<ApiKey, UUID> {

    Optional<ApiKey> findByKeyHash(String keyHash);

    Optional<ApiKey> findByIdAndApiId(UUID id, UUID apiId);

    List<ApiKey> findByApiId(UUID apiId);

    Page<ApiKey> findByApiId(UUID apiId, Pageable pageable);

    List<ApiKey> findByUserId(UUID userId);

    Page<ApiKey> findByUserId(UUID userId, Pageable pageable);

    boolean existsByUserId(UUID userId);

    boolean existsByApiId(UUID apiId);

    boolean existsByPlanId(UUID planId);

    long countByApiIdAndStatus(UUID apiId, ApiKeyStatus status);

    /**
     * Draw an unassigned key from the provider's pool for a specific plan.
     * Ordered so the oldest pooled key is consumed first (FIFO).
     */
    @Query("""
            SELECT k FROM ApiKey k
            WHERE k.api.id = :apiId AND k.user IS NULL
              AND k.status = :status AND k.plan.id = :planId
            ORDER BY k.createdAt ASC
            """)
    List<ApiKey> findPooledKeysForPlan(@Param("apiId") UUID apiId,
                                       @Param("planId") UUID planId,
                                       @Param("status") ApiKeyStatus status,
                                       Pageable pageable);

    /**
     * Draw an unassigned key from the provider's pool with no plan constraint.
     */
    @Query("""
            SELECT k FROM ApiKey k
            WHERE k.api.id = :apiId AND k.user IS NULL AND k.status = :status
            ORDER BY k.createdAt ASC
            """)
    List<ApiKey> findPooledKeys(@Param("apiId") UUID apiId,
                                @Param("status") ApiKeyStatus status,
                                Pageable pageable);

    /** Active keys that have passed their expiry instant — used by the expiry sweep job. */
    @Query("""
            SELECT k FROM ApiKey k
            WHERE k.status = :status AND k.expiresAt IS NOT NULL AND k.expiresAt < :now
            """)
    List<ApiKey> findExpiredActive(@Param("status") ApiKeyStatus status,
                                   @Param("now") LocalDateTime now);
}
