package com.am.backend.model;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.FetchType;
import jakarta.persistence.Index;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;

import java.time.LocalDateTime;

/**
 * A credential used to authenticate gateway calls.
 *
 * <p>Keys are minted by providers into a pool ({@code user == null}). A subscription draws one
 * from the pool by setting {@link #user}; cancelling clears it again. Key material is generated
 * as {@code am_<uuid>} and stored as a SHA-256 hash in {@link #keyHash}; the plaintext is only
 * ever returned once, at creation time.</p>
 */
@Entity
@Table(name = "api_keys", indexes = {
        @Index(name = "idx_api_keys_hash", columnList = "key_hash", unique = true),
        @Index(name = "idx_api_keys_api", columnList = "api_id"),
        @Index(name = "idx_api_keys_user", columnList = "user_id"),
        @Index(name = "idx_api_keys_status", columnList = "status")
})
public class ApiKey extends BaseEntity {

    /** SHA-256 hex digest of the plaintext key. Never the plaintext itself. */
    @Column(name = "key_hash", nullable = false, unique = true, length = 128)
    private String keyHash;

    /**
     * Human-recognisable prefix (first 12 chars of the plaintext) retained for support
     * and for rendering "am_ab12cd…" in list views.
     */
    @Column(name = "key_prefix", nullable = false, length = 24)
    private String keyPrefix;

    /** Optional caller-supplied label, e.g. "prod-ingest". */
    @Column(name = "name", length = 120)
    private String name;

    @Enumerated(EnumType.STRING)
    @Column(name = "status", nullable = false, length = 20)
    private ApiKeyStatus status = ApiKeyStatus.ACTIVE;

    @Column(name = "expires_at")
    private LocalDateTime expiresAt;

    @Column(name = "last_used_at")
    private LocalDateTime lastUsedAt;

    /** {@code null} while the key sits unassigned in the provider's pool. */
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "user_id")
    private User user;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "api_id", nullable = false)
    private Api api;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "plan_id")
    private Plan plan;

    public ApiKey() {
    }

    /**
     * @return {@code true} when the key is ACTIVE and not past its expiry instant.
     */
    public boolean isUsable() {
        return status == ApiKeyStatus.ACTIVE
                && (expiresAt == null || expiresAt.isAfter(LocalDateTime.now()));
    }

    /** @return {@code true} while the key is still in the provider's unassigned pool. */
    public boolean isPooled() {
        return user == null;
    }

    public String getKeyHash() {
        return keyHash;
    }

    public void setKeyHash(String keyHash) {
        this.keyHash = keyHash;
    }

    public String getKeyPrefix() {
        return keyPrefix;
    }

    public void setKeyPrefix(String keyPrefix) {
        this.keyPrefix = keyPrefix;
    }

    public String getName() {
        return name;
    }

    public void setName(String name) {
        this.name = name;
    }

    public ApiKeyStatus getStatus() {
        return status;
    }

    public void setStatus(ApiKeyStatus status) {
        this.status = status;
    }

    public LocalDateTime getExpiresAt() {
        return expiresAt;
    }

    public void setExpiresAt(LocalDateTime expiresAt) {
        this.expiresAt = expiresAt;
    }

    public LocalDateTime getLastUsedAt() {
        return lastUsedAt;
    }

    public void setLastUsedAt(LocalDateTime lastUsedAt) {
        this.lastUsedAt = lastUsedAt;
    }

    public User getUser() {
        return user;
    }

    public void setUser(User user) {
        this.user = user;
    }

    public Api getApi() {
        return api;
    }

    public void setApi(Api api) {
        this.api = api;
    }

    public Plan getPlan() {
        return plan;
    }

    public void setPlan(Plan plan) {
        this.plan = plan;
    }
}
