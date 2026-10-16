package com.am.backend.repository;

import com.am.backend.model.UsageLog;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.time.LocalDateTime;
import java.util.List;
import java.util.UUID;

@Repository
public interface UsageLogRepository extends JpaRepository<UsageLog, UUID> {

    List<UsageLog> findByApiKeyId(UUID apiKeyId);

    Page<UsageLog> findByApiKeyId(UUID apiKeyId, Pageable pageable);

    long countByApiKeyId(UUID apiKeyId);

    Page<UsageLog> findByApiKeyIdAndCreatedAtBetween(UUID apiKeyId,
                                                     LocalDateTime from,
                                                     LocalDateTime to,
                                                     Pageable pageable);

    /** Total requests recorded against an API via any of its keys. */
    @Query("SELECT COUNT(u) FROM UsageLog u WHERE u.apiKey.api.id = :apiId")
    long countByApiId(@Param("apiId") UUID apiId);

    /** Retention prune: delete telemetry older than the retention window. */
    @Modifying
    @Query("DELETE FROM UsageLog u WHERE u.createdAt < :cutoff")
    int deleteOlderThan(@Param("cutoff") LocalDateTime cutoff);
}
