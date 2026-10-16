package com.am.backend.security;

import org.springframework.stereotype.Component;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.security.SecureRandom;
import java.util.HexFormat;
import java.util.UUID;

/**
 * Minting and hashing of API key material.
 *
 * <p>Keys are high-entropy random secrets, so a fast cryptographic digest (SHA-256) is the correct
 * storage primitive — unlike user passwords, there is nothing to brute-force from a dictionary and a
 * slow KDF would only add latency to every gateway request. The database therefore stores only
 * {@code sha256(plaintext)}, and the plaintext is shown to the caller exactly once.</p>
 */
@Component
public class ApiKeyHasher {

    private static final String PREFIX = "am_";
    private static final SecureRandom RANDOM = new SecureRandom();

    /**
     * @return a fresh {@code am_<uuid>} key. The UUID is generated from {@link SecureRandom}.
     */
    public String generate() {
        return PREFIX + UUID.randomUUID().toString().replace("-", "");
    }

    /**
     * @return a fresh key of {@code length} hex characters drawn from {@link SecureRandom}
     */
    public String generate(int length) {
        byte[] bytes = new byte[Math.max(8, length / 2)];
        RANDOM.nextBytes(bytes);
        return PREFIX + HexFormat.of().formatHex(bytes);
    }

    /**
     * Hashes key material for storage and lookup.
     *
     * @param plaintextKey the raw key presented by a caller
     * @return lower-case hex SHA-256 digest, or {@code null} for null input
     */
    public String hash(String plaintextKey) {
        if (plaintextKey == null) {
            return null;
        }
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            byte[] hashed = digest.digest(plaintextKey.getBytes(StandardCharsets.UTF_8));
            return HexFormat.of().formatHex(hashed);
        } catch (NoSuchAlgorithmException ex) {
            // SHA-256 is mandated by the JLS; unreachable in practice.
            throw new IllegalStateException("SHA-256 is unavailable in this JVM", ex);
        }
    }

    /**
     * The truncated display form retained alongside the hash, e.g. {@code am_1a2b3c4d}.
     */
    public String prefixOf(String plaintextKey) {
        if (plaintextKey == null) {
            return null;
        }
        int visible = Math.min(plaintextKey.length(), PREFIX.length() + 8);
        return plaintextKey.substring(0, visible);
    }

    /**
     * Constant-time comparison, used where a caller supplies a key and we compare against a known
     * value rather than relying on a hash lookup.
     */
    public boolean matches(String plaintextKey, String storedHash) {
        if (plaintextKey == null || storedHash == null) {
            return false;
        }
        return MessageDigest.isEqual(
                hash(plaintextKey).getBytes(StandardCharsets.UTF_8),
                storedHash.getBytes(StandardCharsets.UTF_8)
        );
    }
}
