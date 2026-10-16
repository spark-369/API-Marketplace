package com.am.backend.repository;

import com.am.backend.model.Plan;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Repository
public interface PlanRepository extends JpaRepository<Plan, UUID> {

    List<Plan> findByApiId(UUID apiId);

    Optional<Plan> findByIdAndApiId(UUID id, UUID apiId);

    boolean existsByApiIdAndNameIgnoreCase(UUID apiId, String name);

    long countByApiId(UUID apiId);
}
