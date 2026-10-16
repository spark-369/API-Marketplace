package com.am.backend.controller;

import com.am.backend.dto.AuthResponse;
import com.am.backend.dto.LoginRequest;
import com.am.backend.dto.RegisterRequest;
import com.am.backend.service.UserService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.responses.ApiResponses;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * Public authentication endpoints.
 *
 * <p>Both routes are on the security allow-list and neither requires a token.</p>
 */
@RestController
@RequestMapping("/api/auth")
@Tag(name = "Authentication", description = "Registration and login")
public class AuthController {

    private final UserService userService;

    public AuthController(UserService userService) {
        this.userService = userService;
    }

    /**
     * Creates an account and returns a session token, so the client does not need a second call.
     *
     * <p>Self-service registration may request {@code DEVELOPER} or {@code PROVIDER}. The
     * {@code ADMIN} role is never grantable here.</p>
     */
    @PostMapping("/register")
    @Operation(summary = "Register a new account",
            description = "Creates a DEVELOPER or PROVIDER account and returns a JWT")
    @ApiResponses({
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "201", description = "Account created"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "400", description = "Validation failed"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "409", description = "Email already registered")
    })
    public ResponseEntity<AuthResponse> register(@Valid @RequestBody RegisterRequest request) {
        return ResponseEntity.status(HttpStatus.CREATED).body(userService.register(request));
    }

    /**
     * Exchanges credentials for a JWT.
     */
    @PostMapping("/login")
    @Operation(summary = "Authenticate", description = "Exchanges email and password for a JWT")
    @ApiResponses({
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "200", description = "Authenticated"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "401", description = "Invalid credentials")
    })
    public ResponseEntity<AuthResponse> login(@Valid @RequestBody LoginRequest request) {
        return ResponseEntity.ok(userService.login(request));
    }
}
