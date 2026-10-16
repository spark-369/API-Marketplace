package com.am.backend.config;

import io.swagger.v3.oas.models.Components;
import io.swagger.v3.oas.models.OpenAPI;
import io.swagger.v3.oas.models.info.Contact;
import io.swagger.v3.oas.models.info.Info;
import io.swagger.v3.oas.models.info.License;
import io.swagger.v3.oas.models.security.SecurityRequirement;
import io.swagger.v3.oas.models.security.SecurityScheme;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/**
 * OpenAPI/Swagger metadata.
 *
 * <p>Declares the two authentication schemes the platform actually uses, so Swagger UI can present
 * working "Authorize" controls for both browser sessions (bearer JWT) and gateway calls
 * ({@code X-API-Key}).</p>
 */
@Configuration
public class OpenApiConfig {

    private static final String BEARER_SCHEME = "bearerAuth";
    private static final String API_KEY_SCHEME = "apiKeyAuth";

    @Bean
    public OpenAPI apiMarketplaceOpenApi() {
        return new OpenAPI()
                .info(new Info()
                        .title("API Marketplace")
                        .version("v1")
                        .description("""
                                Catalog, subscription, key-management and gateway APIs for the
                                API Marketplace platform.

                                **Authentication**
                                - `/api/auth/**`, catalog reads and the gateway are public or use their
                                  own credential scheme.
                                - Everything else requires `Authorization: Bearer <jwt>` obtained from
                                  `/api/auth/login`.
                                - Gateway forwarding additionally requires `X-API-Key` carrying a key
                                  assigned to your subscription.

                                **Conventions**
                                - Errors share one JSON envelope: `{timestamp, status, message, errors}`.
                                - Resources the caller may not view are reported as `404`, never `403`.
                                - List endpoints are paginated and return a `PageResponse` envelope.
                                """)
                        .contact(new Contact().name("Platform Engineering"))
                        .license(new License().name("Proprietary")))
                .components(new Components()
                        .addSecuritySchemes(BEARER_SCHEME, new SecurityScheme()
                                .type(SecurityScheme.Type.HTTP)
                                .scheme("bearer")
                                .bearerFormat("JWT")
                                .description("Session token issued by /api/auth/login"))
                        .addSecuritySchemes(API_KEY_SCHEME, new SecurityScheme()
                                .type(SecurityScheme.Type.APIKEY)
                                .in(SecurityScheme.In.HEADER)
                                .name("X-API-Key")
                                .description("Gateway credential assigned by a subscription")))
                .addSecurityItem(new SecurityRequirement().addList(BEARER_SCHEME));
    }
}
