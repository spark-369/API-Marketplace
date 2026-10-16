package com.am.backend.security;

import com.am.backend.dto.ErrorResponse;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpMethod;
import org.springframework.http.MediaType;
import org.springframework.security.authentication.AuthenticationManager;
import org.springframework.security.authentication.dao.DaoAuthenticationProvider;
import org.springframework.security.config.annotation.authentication.configuration.AuthenticationConfiguration;
import org.springframework.security.config.annotation.method.configuration.EnableMethodSecurity;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity;
import org.springframework.security.config.annotation.web.configurers.AbstractHttpConfigurer;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.core.userdetails.UserDetailsService;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.UsernamePasswordAuthenticationFilter;
import org.springframework.web.cors.CorsConfiguration;
import org.springframework.web.cors.CorsConfigurationSource;
import org.springframework.web.cors.UrlBasedCorsConfigurationSource;

import java.io.IOException;
import java.util.Arrays;
import java.util.List;

/**
 * Stateless JWT security configuration.
 *
 * <p>CSRF is disabled (no cookie-based sessions), sessions are never created, unauthenticated and
 * forbidden requests receive the same JSON envelope as every other error, and role checks are
 * declared per-endpoint with {@code @PreAuthorize}.</p>
 */
@Configuration
@EnableWebSecurity
@EnableMethodSecurity
public class SecurityConfig {

    private final JwtAuthenticationFilter jwtAuthenticationFilter;
    private final UserDetailsService userDetailsService;
    private final ObjectMapper objectMapper;

    /**
     * Comma-separated origin allow-list. {@code *} is only appropriate for local development and
     * is never combined with credentials.
     */
    @Value("${app.cors.allowed-origins}")
    private String allowedOrigins;

    public SecurityConfig(JwtAuthenticationFilter jwtAuthenticationFilter,
                          UserDetailsService userDetailsService,
                          ObjectMapper objectMapper) {
        this.jwtAuthenticationFilter = jwtAuthenticationFilter;
        this.userDetailsService = userDetailsService;
        this.objectMapper = objectMapper;
    }

    @Bean
    public SecurityFilterChain securityFilterChain(HttpSecurity http) throws Exception {
        http
                .csrf(AbstractHttpConfigurer::disable)
                .cors(cors -> cors.configurationSource(corsConfigurationSource()))
                .sessionManagement(session -> session.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
                .authorizeHttpRequests(auth -> auth
                        // ---- Public auth endpoints ----------------------------------
                        .requestMatchers(HttpMethod.POST, "/api/auth/register", "/api/auth/login").permitAll()
                        // ---- API documentation -------------------------------------
                        .requestMatchers(
                                "/v3/api-docs/**",
                                "/swagger-ui.html",
                                "/swagger-ui/**"
                        ).permitAll()
                        // ---- Health probes -----------------------------------------
                        .requestMatchers("/actuator/health", "/actuator/health/**").permitAll()
                        // ---- Actuator (everything else ADMIN only) -----------------
                        .requestMatchers("/actuator/**").hasRole("ADMIN")
                        // ---- Gateway: application-level X-API-Key auth -------------
                        .requestMatchers("/api/gateway/**").permitAll()
                        // ---- Public catalog reads ----------------------------------
                        .requestMatchers(HttpMethod.GET,
                                "/api/apis",
                                "/api/apis/published",
                                "/api/apis/slug/**",
                                "/api/apis/*/plans/**",
                                "/api/apis/*/reviews",
                                "/api/categories",
                                "/api/categories/**"
                        ).permitAll()
                        // Single-API read by id. Restricted to a UUID so it cannot swallow the
                        // reserved sub-paths /api/apis/all and /api/apis/my, which are admin- and
                        // provider-scoped. Those must fall through to authenticated() below so an
                        // anonymous caller receives 401 rather than reaching a 403 from @PreAuthorize.
                        .requestMatchers(HttpMethod.GET,
                                "/api/apis/{id:[0-9a-fA-F-]{36}}"
                        ).permitAll()
                        // ---- Everything else requires authentication ----------------
                        .anyRequest().authenticated()
                )
                .exceptionHandling(ex -> ex
                        .authenticationEntryPoint((request, response, authException) ->
                                writeError(response, HttpServletResponse.SC_UNAUTHORIZED, "Authentication required"))
                        .accessDeniedHandler((request, response, accessDeniedException) ->
                                writeError(response, HttpServletResponse.SC_FORBIDDEN,
                                        "You do not have permission to perform this action"))
                )
                .authenticationProvider(authenticationProvider())
                .addFilterBefore(jwtAuthenticationFilter, UsernamePasswordAuthenticationFilter.class);

        return http.build();
    }

    /**
     * Bean-based authentication using {@link BCryptPasswordEncoder}.
     */
    @Bean
    public DaoAuthenticationProvider authenticationProvider() {
        DaoAuthenticationProvider provider = new DaoAuthenticationProvider();
        provider.setUserDetailsService(userDetailsService);
        provider.setPasswordEncoder(passwordEncoder());
        provider.setHideUserNotFoundExceptions(true);
        return provider;
    }

    @Bean
    public AuthenticationManager authenticationManager(AuthenticationConfiguration configuration) throws Exception {
        return configuration.getAuthenticationManager();
    }

    /**
     * BCrypt with the default strength (10 rounds).
     */
    @Bean
    public PasswordEncoder passwordEncoder() {
        return new BCryptPasswordEncoder();
    }

    /**
     * CORS for the SPA dev server and any configured deployment origins.
     *
     * <p>Credentials are only advertised when an explicit origin list is configured — a wildcard
     * origin combined with credentials is rejected by browsers and weakens the posture.</p>
     */
    @Bean
    public CorsConfigurationSource corsConfigurationSource() {
        List<String> origins = parseOrigins();
        boolean wildcard = origins.contains("*");

        CorsConfiguration configuration = new CorsConfiguration();
        if (wildcard) {
            configuration.setAllowedOriginPatterns(List.of("*"));
            configuration.setAllowCredentials(false);
        } else {
            configuration.setAllowedOrigins(origins);
            configuration.setAllowCredentials(true);
        }
        configuration.setAllowedMethods(List.of("GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"));
        configuration.setAllowedHeaders(List.of(
                "Authorization", "Content-Type", "Accept", "X-API-Key", "X-Requested-With"));
        configuration.setExposedHeaders(List.of("Retry-After", "X-RateLimit-Limit", "X-RateLimit-Window"));
        configuration.setMaxAge(3600L);

        UrlBasedCorsConfigurationSource source = new UrlBasedCorsConfigurationSource();
        source.registerCorsConfiguration("/**", configuration);
        return source;
    }

    private List<String> parseOrigins() {
        return Arrays.stream(allowedOrigins.split(","))
                .map(String::trim)
                .filter(origin -> !origin.isEmpty())
                .toList();
    }

    /**
     * Renders an error envelope directly on the servlet response, bypassing Spring MVC so that
     * failures inside the security filter chain still produce the standard JSON contract.
     */
    private void writeError(HttpServletResponse response, int status, String message) throws IOException {
        response.setStatus(status);
        response.setContentType(MediaType.APPLICATION_JSON_VALUE);
        response.setCharacterEncoding("UTF-8");
        objectMapper.writeValue(response.getWriter(), ErrorResponse.of(status, message));
    }
}

