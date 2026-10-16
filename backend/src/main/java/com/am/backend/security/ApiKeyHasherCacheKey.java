package com.am.backend.security;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.HexFormat;

/**
 * Derives a safe, non-reversible cache key from presented API-key material.
 *
 * <p>Cache keys end up in Redis and in diagnostic tooling, so the plaintext secret must never be
 * part of one. This produces a truncated SHA-256 digest — enough to be collision-free in practice
 * for cache lookups, and useless to anyone who reads it.</p>
 */
public final class ApiKeyHasherCacheKey {

    private ApiKeyHasherCacheKey() {
    }

    /**
     * @param rawKey the plaintext key, possibly null or blank
     * @return a short hex digest, or {@code "absent"} when no key was supplied
     */
    public static String of(String rawKey) {
        if (rawKey == null || rawKey.isBlank()) {
            return "absent";
        }
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            byte[] hash = digest.digest(rawKey.trim().getBytes(StandardCharsets.UTF_8));
            return HexFormat.of().formatHex(hash).substring(0, 32);
        } catch (NoSuchAlgorithmException ex) {
            throw new IllegalStateException("SHA-256 is unavailable in this JVM", ex);
        }
    }
}
