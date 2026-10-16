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

import java.math.BigDecimal;

/**
 * A published (or draft) API listed in the marketplace.
 *
 * <p>{@code owner} is mandatory; {@code category} is optional. Rating fields are denormalized and
 * recomputed by {@code ReviewService#recalculateApiRating} whenever reviews change.</p>
 */
@Entity
@Table(name = "apis", indexes = {
        @Index(name = "idx_apis_slug", columnList = "slug", unique = true),
        @Index(name = "idx_apis_status_visibility", columnList = "status,visibility"),
        @Index(name = "idx_apis_owner", columnList = "owner_id"),
        @Index(name = "idx_apis_category", columnList = "category_id")
})
public class Api extends BaseEntity {

    @Column(name = "name", nullable = false, length = 180)
    private String name;

    @Column(name = "slug", nullable = false, unique = true, length = 200)
    private String slug;

    @Column(name = "description", length = 4000)
    private String description;

    @Column(name = "base_url", nullable = false, length = 700)
    private String baseUrl;

    @Column(name = "documentation_url", length = 700)
    private String documentationUrl;

    @Enumerated(EnumType.STRING)
    @Column(name = "status", nullable = false, length = 20)
    private ApiStatus status = ApiStatus.DRAFT;

    @Enumerated(EnumType.STRING)
    @Column(name = "visibility", nullable = false, length = 20)
    private ApiVisibility visibility = ApiVisibility.PRIVATE;

    @Column(name = "version", length = 40)
    private String version = "1.0.0";

    @Column(name = "average_rating", nullable = false, precision = 4, scale = 2)
    private BigDecimal averageRating = BigDecimal.ZERO;

    @Column(name = "review_count", nullable = false)
    private long reviewCount = 0L;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "category_id")
    private Category category;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "owner_id", nullable = false)
    private User owner;

    public Api() {
    }

    /**
     * A public API is listable iff it is PUBLISHED and not PRIVATE.
     */
    public boolean isPubliclyVisible() {
        return status == ApiStatus.PUBLISHED && visibility != ApiVisibility.PRIVATE;
    }

    public String getName() {
        return name;
    }

    public void setName(String name) {
        this.name = name;
    }

    public String getSlug() {
        return slug;
    }

    public void setSlug(String slug) {
        this.slug = slug;
    }

    public String getDescription() {
        return description;
    }

    public void setDescription(String description) {
        this.description = description;
    }

    public String getBaseUrl() {
        return baseUrl;
    }

    public void setBaseUrl(String baseUrl) {
        this.baseUrl = baseUrl;
    }

    public String getDocumentationUrl() {
        return documentationUrl;
    }

    public void setDocumentationUrl(String documentationUrl) {
        this.documentationUrl = documentationUrl;
    }

    public ApiStatus getStatus() {
        return status;
    }

    public void setStatus(ApiStatus status) {
        this.status = status;
    }

    public ApiVisibility getVisibility() {
        return visibility;
    }

    public void setVisibility(ApiVisibility visibility) {
        this.visibility = visibility;
    }

    public String getVersion() {
        return version;
    }

    public void setVersion(String version) {
        this.version = version;
    }

    public BigDecimal getAverageRating() {
        return averageRating;
    }

    public void setAverageRating(BigDecimal averageRating) {
        this.averageRating = averageRating;
    }

    public long getReviewCount() {
        return reviewCount;
    }

    public void setReviewCount(long reviewCount) {
        this.reviewCount = reviewCount;
    }

    public Category getCategory() {
        return category;
    }

    public void setCategory(Category category) {
        this.category = category;
    }

    public User getOwner() {
        return owner;
    }

    public void setOwner(User owner) {
        this.owner = owner;
    }
}
