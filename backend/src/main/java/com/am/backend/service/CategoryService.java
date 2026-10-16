package com.am.backend.service;

import com.am.backend.cache.CacheNames;
import com.am.backend.dto.CategoryRequest;
import com.am.backend.dto.CategoryResponse;
import com.am.backend.exception.ConflictException;
import com.am.backend.exception.NotFoundException;
import com.am.backend.model.Category;
import com.am.backend.repository.ApiRepository;
import com.am.backend.repository.CategoryRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.cache.annotation.CacheEvict;
import org.springframework.cache.annotation.Cacheable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.UUID;

/**
 * Category CRUD. Names are unique case-insensitively, and a category cannot be deleted while APIs
 * still reference it.
 */
@Service
public class CategoryService {

    private static final Logger log = LoggerFactory.getLogger(CategoryService.class);

    private final CategoryRepository categoryRepository;
    private final ApiRepository apiRepository;

    public CategoryService(CategoryRepository categoryRepository, ApiRepository apiRepository) {
        this.categoryRepository = categoryRepository;
        this.apiRepository = apiRepository;
    }

    @Transactional(readOnly = true)
    @Cacheable(cacheNames = CacheNames.CATEGORIES, key = "'" + CacheNames.Keys.ALL_CATEGORIES + "'")
    public List<CategoryResponse> listCategories() {
        return categoryRepository.findAll().stream()
                .map(category -> CategoryResponse.from(category, apiRepository.findByCategoryId(category.getId()).size()))
                .toList();
    }

    @Transactional(readOnly = true)
    @Cacheable(cacheNames = CacheNames.CATEGORIES, key = "'id:' + #id")
    public CategoryResponse getCategory(UUID id) {
        Category category = requireCategory(id);
        return CategoryResponse.from(category, apiRepository.findByCategoryId(id).size());
    }

    @Transactional
    @CacheEvict(cacheNames = CacheNames.CATEGORIES, allEntries = true)
    public CategoryResponse createCategory(CategoryRequest request) {
        String name = request.name().trim();
        if (categoryRepository.existsByNameIgnoreCase(name)) {
            throw new ConflictException("A category named '" + name + "' already exists");
        }
        Category saved = categoryRepository.save(new Category(name, request.description()));
        log.info("Created category {} ({})", saved.getName(), saved.getId());
        return CategoryResponse.from(saved);
    }

    @Transactional
    @CacheEvict(cacheNames = CacheNames.CATEGORIES, allEntries = true)
    public CategoryResponse updateCategory(UUID id, CategoryRequest request) {
        Category category = requireCategory(id);
        String name = request.name().trim();
        if (categoryRepository.existsByNameIgnoreCase(name)
                && !category.getName().equalsIgnoreCase(name)) {
            throw new ConflictException("A category named '" + name + "' already exists");
        }
        category.setName(name);
        category.setDescription(request.description());
        return CategoryResponse.from(categoryRepository.save(category));
    }

    /**
     * Deletes a category, refusing when any API still references it.
     */
    @Transactional
    @CacheEvict(cacheNames = CacheNames.CATEGORIES, allEntries = true)
    public void deleteCategory(UUID id) {
        Category category = requireCategory(id);
        if (apiRepository.existsByCategoryId(id)) {
            throw new ConflictException("Cannot delete this category while APIs are still assigned to it");
        }
        categoryRepository.delete(category);
        log.info("Deleted category {}", id);
    }

    @Transactional(readOnly = true)
    public Category requireCategory(UUID id) {
        return categoryRepository.findById(id)
                .orElseThrow(() -> new NotFoundException("Category not found"));
    }
}
