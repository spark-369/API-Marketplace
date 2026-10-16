package com.am.backend.service;

import com.am.backend.dto.AdminUpdateUserRequest;
import com.am.backend.dto.AuthResponse;
import com.am.backend.dto.LoginRequest;
import com.am.backend.dto.PageResponse;
import com.am.backend.dto.RegisterRequest;
import com.am.backend.dto.UpdateProfileRequest;
import com.am.backend.dto.UserResponse;
import com.am.backend.exception.ConflictException;
import com.am.backend.exception.NotFoundException;
import com.am.backend.model.Role;
import com.am.backend.model.User;
import com.am.backend.repository.ApiKeyRepository;
import com.am.backend.repository.ApiRepository;
import com.am.backend.repository.ReviewRepository;
import com.am.backend.repository.SubscriptionRepository;
import com.am.backend.repository.UserRepository;
import com.am.backend.security.JwtService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.security.authentication.AuthenticationManager;
import org.springframework.security.authentication.BadCredentialsException;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.Locale;
import java.util.UUID;

/**
 * Account lifecycle: registration, login, self-service profile edits and admin user administration.
 */
@Service
public class UserService {

    private static final Logger log = LoggerFactory.getLogger(UserService.class);

    private final UserRepository userRepository;
    private final ApiRepository apiRepository;
    private final ApiKeyRepository apiKeyRepository;
    private final SubscriptionRepository subscriptionRepository;
    private final ReviewRepository reviewRepository;
    private final PasswordEncoder passwordEncoder;
    private final JwtService jwtService;
    private final AuthenticationManager authenticationManager;

    public UserService(UserRepository userRepository,
                       ApiRepository apiRepository,
                       ApiKeyRepository apiKeyRepository,
                       SubscriptionRepository subscriptionRepository,
                       ReviewRepository reviewRepository,
                       PasswordEncoder passwordEncoder,
                       JwtService jwtService,
                       AuthenticationManager authenticationManager) {
        this.userRepository = userRepository;
        this.apiRepository = apiRepository;
        this.apiKeyRepository = apiKeyRepository;
        this.subscriptionRepository = subscriptionRepository;
        this.reviewRepository = reviewRepository;
        this.passwordEncoder = passwordEncoder;
        this.jwtService = jwtService;
        this.authenticationManager = authenticationManager;
    }

    /**
     * Registers a new account, hashes the password, and returns a ready-to-use session.
     *
     * <p>Email is normalized to lower case so that {@code A@b.com} and {@code a@b.com} cannot both
     * exist. {@code ADMIN} is never assignable through registration.</p>
     */
    @Transactional
    public AuthResponse register(RegisterRequest request) {
        String email = normalizeEmail(request.email());
        if (userRepository.existsByEmail(email)) {
            throw new ConflictException("An account with that email already exists");
        }

        Role role = resolveSelfServiceRole(request.role());
        User user = new User(
                email,
                passwordEncoder.encode(request.password()),
                request.firstName().trim(),
                request.lastName().trim(),
                role
        );
        User saved = userRepository.save(user);
        log.info("Registered new {} account {}", role, saved.getId());

        return AuthResponse.of(jwtService.generateToken(saved), saved);
    }

    /**
     * Verifies credentials and issues a JWT.
     *
     * <p>Failures are deliberately indistinguishable between "unknown email" and "wrong password".</p>
     */
    @Transactional(readOnly = true)
    public AuthResponse login(LoginRequest request) {
        String email = normalizeEmail(request.email());
        try {
            authenticationManager.authenticate(
                    new UsernamePasswordAuthenticationToken(email, request.password()));
        } catch (BadCredentialsException ex) {
            log.debug("Failed login attempt for {}", email);
            throw new BadCredentialsException("Invalid email or password");
        }

        User user = userRepository.findByEmail(email)
                .orElseThrow(() -> new BadCredentialsException("Invalid email or password"));

        return AuthResponse.of(jwtService.generateToken(user), user);
    }

    // ---- Profile -----------------------------------------------------------

    @Transactional(readOnly = true)
    public UserResponse getProfile(UUID userId) {
        return UserResponse.from(requireUser(userId));
    }

    /**
     * Applies a partial profile update: {@code null} fields are left unchanged.
     */
    @Transactional
    public UserResponse updateProfile(UUID userId, UpdateProfileRequest request) {
        User user = requireUser(userId);
        if (request.firstName() != null) {
            user.setFirstName(request.firstName().trim());
        }
        if (request.lastName() != null) {
            user.setLastName(request.lastName().trim());
        }
        if (request.bio() != null) {
            user.setBio(request.bio());
        }
        if (request.avatarUrl() != null) {
            user.setAvatarUrl(request.avatarUrl());
        }
        return UserResponse.from(userRepository.save(user));
    }

    // ---- Admin administration ----------------------------------------------

    @Transactional(readOnly = true)
    public PageResponse<UserResponse> listUsers(Pageable pageable) {
        Page<User> page = userRepository.findAll(pageable);
        return PageResponse.from(page, UserResponse::from);
    }

    @Transactional(readOnly = true)
    public PageResponse<UserResponse> listDevelopers(Pageable pageable) {
        Page<User> page = userRepository.findByRole(Role.DEVELOPER, pageable);
        return PageResponse.from(page, UserResponse::from);
    }

    @Transactional(readOnly = true)
    public UserResponse getUser(UUID id) {
        return UserResponse.from(requireUser(id));
    }

    /**
     * Admin edit of an arbitrary account. A blank password leaves the credential untouched.
     */
    @Transactional
    public UserResponse adminUpdateUser(UUID id, AdminUpdateUserRequest request) {
        User user = requireUser(id);

        if (request.email() != null) {
            String email = normalizeEmail(request.email());
            if (!email.equals(user.getEmail()) && userRepository.existsByEmail(email)) {
                throw new ConflictException("An account with that email already exists");
            }
            user.setEmail(email);
        }
        if (request.password() != null && !request.password().isBlank()) {
            user.setPassword(passwordEncoder.encode(request.password()));
        }
        if (request.firstName() != null) {
            user.setFirstName(request.firstName().trim());
        }
        if (request.lastName() != null) {
            user.setLastName(request.lastName().trim());
        }
        if (request.role() != null) {
            user.setRole(Role.valueOf(request.role()));
        }
        if (request.bio() != null) {
            user.setBio(request.bio());
        }
        if (request.avatarUrl() != null) {
            user.setAvatarUrl(request.avatarUrl());
        }
        return UserResponse.from(userRepository.save(user));
    }

    /**
     * Deletes an account only when it owns no APIs, keys, subscriptions or reviews.
     *
     * <p>Refusing rather than cascading is deliberate: an admin deleting a provider must first
     * decide what happens to that provider's published APIs, keys and live subscriptions.</p>
     *
     * @throws ConflictException when dependent records still exist
     */
    @Transactional
    public void deleteUser(UUID id) {
        User user = requireUser(id);
        ensureDeletable(id);
        userRepository.delete(user);
        log.info("Deleted user {}", id);
    }

    /**
     * Verifies an account has no dependent records.
     */
    @Transactional(readOnly = true)
    public void ensureDeletable(UUID userId) {
        List<String> blockers = new java.util.ArrayList<>();
        if (apiRepository.countByOwnerId(userId) > 0) {
            blockers.add("APIs");
        }
        if (apiKeyRepository.existsByUserId(userId)) {
            blockers.add("API keys");
        }
        if (subscriptionRepository.existsByUserId(userId)) {
            blockers.add("subscriptions");
        }
        if (reviewRepository.existsByUserId(userId)) {
            blockers.add("reviews");
        }
        if (!blockers.isEmpty()) {
            throw new ConflictException(
                    "Cannot delete this user while they still own " + String.join(", ", blockers));
        }
    }

    // ---- Helpers -----------------------------------------------------------

    @Transactional(readOnly = true)
    public User requireUser(UUID id) {
        return userRepository.findById(id)
                .orElseThrow(() -> new NotFoundException("User not found"));
    }

    @Transactional(readOnly = true)
    public User requireUserByEmail(String email) {
        return userRepository.findByEmail(normalizeEmail(email))
                .orElseThrow(() -> new NotFoundException("User not found"));
    }

    public static String normalizeEmail(String email) {
        return email == null ? null : email.trim().toLowerCase(Locale.ROOT);
    }

    private Role resolveSelfServiceRole(String requested) {
        if (requested == null || requested.isBlank()) {
            return Role.DEVELOPER;
        }
        Role role = Role.valueOf(requested);
        return role == Role.PROVIDER ? Role.PROVIDER : Role.DEVELOPER;
    }
}

