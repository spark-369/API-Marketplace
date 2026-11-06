# System Blueprint — API Marketplace (`v1`)

> **Document scope:** Full-stack system design reference for the API Marketplace monorepo. Covers
> architecture, domain model, security, APIs, frontend, testing, operations, and pre-production
> hardening.
>
> **Source of truth:** Derived from the working tree in `backend/` (Spring Boot) and `frontend/`
> (React + Vite). All paths are relative to the repository root.
>
> **Status:** `v1` — see §15 (Known Gaps) and §16 (Definition of Done).

---

## Table of Contents

1. Executive Summary
2. Repository Layout
3. Technology Stack
4. Architecture Overview
5. Domain Model
6. Security Design
7. REST API Reference
8. Service Layer Reference
9. Frontend Architecture
10. Frontend Testing Strategy
11. Configuration & Environment
12. End-to-End Flows
13. Cross-Cutting Concerns
14. Local Development & Run
15. Known Gaps & Remediation Backlog
16. Definition of Done for v1
17. Glossary

---

## 1. Executive Summary

**API Marketplace** is a platform where **providers** publish APIs, **developers** discover, subscribe
to, and consume those APIs, and **admins** govern the marketplace. The backend also implements a
**gateway** that proxies runtime traffic to upstream APIs behind issued API keys, recording usage
telemetry for billing, analytics, and quota enforcement.

| App | Stack | Location | Default port |
|-----|-------|----------|--------------|
| Backend API | Spring Boot 3.4 (Java 17), PostgreSQL, Redis, Spring Security + JWT | `backend/` | `8080` |
| Frontend SPA | React 18, Vite, React Router, Redux Toolkit, Tailwind CSS, native `fetch` | `frontend/` | `5173` |

### 1.1 Core capabilities

- JWT authentication (register / login) with role-based authorization (`ADMIN`, `PROVIDER`, `DEVELOPER`).
- API catalog with categories, plans (pricing tiers), reviews, and average-rating aggregation.
- Subscriptions that **delegate** an API key from a provider-managed key pool.
- An HTTP **gateway** that forwards requests to upstream APIs and logs per-request usage.
- **Redis-backed rate limiting** at the gateway, enforced per API key against the plan quota.
- **Redis-backed caching** for hot public reads (catalog, categories, plans).
- **JobRunr** background jobs (usage-log persistence and retention, rating recompute, expiry sweeps).
- OpenAPI/Swagger docs, Actuator health + Prometheus metrics, HikariCP pooling, centralized errors.
- **Frontend test suite** using Vitest + React Testing Library with v8 coverage enforced in CI.

---

## 2. Repository Layout

```
.
├── README.md
├── .env.example                             # Environment template
├── docker-compose.yml                       # One-command local stack
├── docs/
│   ├── RUNBOOK.md                           # Deploy, rollback, key rotation, incidents
│   └── System_Blueprint.md                  # This document
├── backend/                                 # Spring Boot application
│   ├── mvnw / mvnw.cmd                      # Maven wrapper
│   ├── pom.xml
│   └── src/
│       ├── main/java/com/am/backend/
│       │   ├── BackendApplication.java
│       │   ├── cache/                       # CacheNames, RedisCacheConfig
│       │   ├── config/                      # OpenApiConfig, PaginationConfig
│       │   ├── controller/                  # REST controllers
│       │   ├── dto/                         # Request/response records
│       │   ├── exception/                   # Domain exceptions + GlobalExceptionHandler
│       │   ├── job/                         # JobRunr job handlers
│       │   ├── model/                       # JPA entities + enums
│       │   ├── ratelimit/                   # Redis fixed-window limiter
│       │   ├── repository/                  # Spring Data JPA repositories
│       │   ├── security/                    # SecurityConfig, JWT, hasher, SSRF guard
│       │   └── service/                     # Business logic
│       ├── main/resources/
│       │   └── application.properties
│       └── test/
│           ├── java/com/am/backend/         # Unit + context tests
│           └── resources/application-test.properties
└── frontend/                                # React SPA
    ├── package.json · vite.config.js · vitest.config.js
    ├── tailwind.config.js · postcss.config.js · eslint.config.js
    ├── src/
    │   ├── main.jsx · App.jsx · index.css
    │   ├── api/client.js                    # Single HTTP boundary
    │   ├── store/                           # Redux Toolkit slices
    │   ├── hooks/                           # useAppDispatch / useAppSelector
    │   ├── components/                      # Layout, guards, modals, UI kit
    │   └── pages/                           # One file per route view
    └── tests/
        ├── setup.js · utils/ · __mocks__/
        ├── unit/                            # Reducers, selectors, client contract

---

## 3. Technology Stack

### 3.1 Backend (`backend/pom.xml`)

| Concern | Choice |
|---------|--------|
| Framework | Spring Boot 3.4.1 (parent POM), Java 17 |
| Web | `spring-boot-starter-web` |
| Persistence | `spring-boot-starter-data-jpa` + PostgreSQL driver (H2 for tests) |
| Cache / Rate limit | `spring-boot-starter-data-redis` (Lettuce) + `spring-boot-starter-cache` |
| Background jobs | `jobrunr-spring-boot-3-starter` 7.3.2 (Redis-backed) |
| Security | `spring-boot-starter-security` + `spring-security-test` |
| Validation | `spring-boot-starter-validation` |
| Ops | `spring-boot-starter-actuator` + `micrometer-registry-prometheus` |
| JWT | jjwt 0.12.6 (`jjwt-api` / `jjwt-impl` / `jjwt-jackson`) |
| API docs | springdoc-openapi 2.7.0 |
| Coverage | JaCoCo 0.8.12 (`prepare-agent` + `report` bound to `verify`) |

**Explicitly not used:** Flyway/Liquibase (schema is managed out-of-band in prod), Resilience4j,
OpenTelemetry tracing.

### 3.2 Frontend (`frontend/package.json`)

| Concern | Choice |
|---------|--------|
| Language | JavaScript (ES2022+) — no TypeScript |
| UI library | React 18 + React DOM |
| Routing | `react-router-dom` 7 |
| State | Redux Toolkit 2 + `react-redux` 9 |
| Styling | Tailwind CSS 3 via PostCSS + autoprefixer |
| Build | Vite 6 + `@vitejs/plugin-react` |
| HTTP | Native `fetch` wrapped in `src/api/client.js` |
| Testing | Vitest 2 (jsdom) + React Testing Library + jest-dom + user-event |
| Coverage | `@vitest/coverage-v8` |
| Lint | ESLint 9 + react-hooks + react-refresh |

---

## 4. Architecture Overview

### 4.1 System diagram

```
┌──────────────────────────────────────────────────────────────────────┐
│                          Browser (SPA)                                │
│  React + React Router  ·  Redux Toolkit (global state)                │
│  Tailwind CSS  ·  localStorage(JWT)  ·  src/api/client.js             │
└───────────────┬──────────────────────────────────────────────────────┘
                │  /api/*   (Vite dev proxy → http://localhost:8080)
                ▼
┌──────────────────────────────────────────────────────────────────────┐
│                    Spring Boot Backend (:8080)                        │
│                                                                       │
│  JwtAuthenticationFilter ─► SecurityFilterChain ─► @RestController    │
│                                   │                     │             │
│                          @PreAuthorize (roles)          ▼             │
│                                                   @Service (tx)       │
│                             ┌───────────────────────────┼───────────┐ │
│                             ▼                           ▼           ▼ │
│                   Spring Data JPA              Redis (cache)   JobRunr│
│                             │                  Redis (rate limit) jobs│
│                             ▼                                         │
│                     PostgreSQL (:5432)                                │
│                                                                       │
│  GatewayService (JDK HttpClient, SSRF-validated) ──► external upstream │
└──────────────────────────────────────────────────────────────────────┘
```

### 4.2 Backend layering

1. **Controller** — HTTP mapping, `@Valid` validation, `@PreAuthorize` role gating.
2. **Service** — business rules, ownership checks, transactions, entity→DTO mapping.
3. **Repository** — Spring Data JPA derived queries.
4. **Model** — JPA entities extending `BaseEntity` (UUID PK + audit timestamps).
5. **Cross-cutting** — `GlobalExceptionHandler`, `SecurityConfig`, `JwtAuthenticationFilter`, Redis
   cache manager, Redis rate limiter, JobRunr.

### 4.3 Frontend state architecture (Redux Toolkit)

- **Single global store** via `configureStore`; all cross-page state lives in slices.
- **API boundary** isolated in `src/api/client.js`; slices call it from `createAsyncThunk`.
- **`authSlice`** owns the session (token, user, role flags) and mirrors them to `localStorage`.
- **Domain slices** own server-derived collections with `status` and `error`.
- **`uiSlice`** owns ephemeral client state (toasts, modals, sidebar).
- Components read via `useAppSelector`, dispatch via `useAppDispatch`.

---

        └── component/                       # Components and pages (RTL)
```


## 5. Domain Model

### 5.1 Base entity

All entities extend `BaseEntity` (`@MappedSuperclass`): `UUID id` (Hibernate `@UuidGenerator`,
`updatable = false`), plus `createdAt` / `updatedAt` maintained by `@PrePersist` / `@PreUpdate`
(`created_at` is non-updatable).

### 5.2 Entities

| Entity | Table | Key fields | Relationships |
|--------|-------|------------|---------------|
| **User** | `users` | `email` (unique, login id), `password` (BCrypt), `firstName`, `lastName`, `role`, `bio`, `avatarUrl` | implements `UserDetails` |
| **Api** | `apis` | `name`, `slug` (unique), `description`, `baseUrl`, `documentationUrl`, `status`, `visibility`, `version`, `averageRating`, `reviewCount` | `category` (M:1, optional), `owner` (M:1 → User, required) |
| **Category** | `categories` | `name` (unique), `description` | — |
| **Plan** | `plans` | `name`, `description`, `price`, `rateLimit`, `ratePeriod`, `supportLevel` | `api` (M:1, required); unique `(api_id, name)` |
| **Review** | `reviews` | `rating` (1–5), `title`, `comment` | `api` (M:1), `user` (M:1); unique `(api_id, user_id)` |
| **Subscription** | `subscriptions` | `status`, `startedAt`, `expiresAt`, `cancelledAt` | `user` (M:1), `api` (M:1), `plan` (M:1, optional) |
| **ApiKey** | `api_keys` | `keyHash` (unique — SHA-256 hex), `keyPrefix`, `name`, `status`, `expiresAt`, `lastUsedAt` | `user` (M:1, nullable = unassigned pool), `api` (M:1), `plan` (M:1, optional) |
| **UsageLog** | `usage_logs` | `endpoint`, `method`, `statusCode`, `latencyMs`, `ipAddress`, `userAgent` | `apiKey` (M:1, required) |

> **API keys are never stored in plaintext.** `ApiKey.keyHash` holds `sha256(plaintext)` and
> `keyPrefix` holds a short display form (`am_1a2b3c4d`). The plaintext is returned exactly once, by
> `createKey` or `rotateKey`.

### 5.3 Enums

| Enum | Values | Used by |
|------|--------|---------|
| `Role` | `ADMIN`, `PROVIDER`, `DEVELOPER` | `User.role` (default `DEVELOPER`) |
| `ApiStatus` | `DRAFT`, `PUBLISHED`, `ARCHIVED` | `Api.status` (default `DRAFT`) |
| `ApiVisibility` | `PUBLIC`, `PRIVATE` | `Api.visibility` (default `PRIVATE`) |
| `ApiKeyStatus` | `ACTIVE`, `REVOKED`, `EXPIRED` | `ApiKey.status` (default `ACTIVE`) |
| `SubscriptionStatus` | `ACTIVE`, `CANCELLED`, `EXPIRED` | `Subscription.status` (default `ACTIVE`) |
| `RatePeriod` | `SECOND`, `MINUTE`, `HOUR`, `DAY`, `MONTH` | `Plan.ratePeriod`; `seconds()` yields the window length |

All enums persist as strings (`@Enumerated(EnumType.STRING)`).

### 5.4 Domain rules

- **Public visibility:** an API is publicly listable iff `status == PUBLISHED` **and**
  `visibility != PRIVATE` (`Api.isPubliclyVisible()`). A caller who may not view an API receives
  **404 `API not found`**, never 403, so status codes cannot be used to enumerate drafts.
- **Rating aggregation:** `ReviewService` recomputes `averageRating` and `reviewCount` on every
  review create/update/delete.
- **One review per user per API** (DB unique constraint + service check).
- **One subscription per user per API** (`SubscriptionRepository.findByUserIdAndApiId` guard).
- **Key lifecycle:** providers provision unassigned keys (`user = null`) → a subscription delegates
  one → cancellation returns it to the pool (marking it `EXPIRED` if past `expiresAt`).

---


## 6. Security Design

### 6.1 Components (`backend/.../security/`)

- **`SecurityConfig`** — `@Configuration @EnableWebSecurity @EnableMethodSecurity`: CSRF disabled,
  `STATELESS` sessions, CORS via `corsConfigurationSource()`, JSON `authenticationEntryPoint` (401)
  and `accessDeniedHandler` (403), `DaoAuthenticationProvider` + `BCryptPasswordEncoder`,
  `JwtAuthenticationFilter` before `UsernamePasswordAuthenticationFilter`.
- **`JwtAuthenticationFilter`** — parses `Authorization: Bearer <jwt>`, loads `User` by email,
  validates, populates `SecurityContext`. Invalid tokens are swallowed → request continues anonymous.
- **`JwtService`** — HS256 issue/parse using `app.jwt.secret`; `role` claim; `subject = email`.
- **`ApiKeyHasher` / `ApiKeyHasherCacheKey`** — `am_<uuid>` minting, SHA-256 hashing, and a truncated
  digest used as the Redis cache key so plaintext never reaches Redis.
- **`OutboundUrlValidator`** — the gateway's SSRF guard.
- **`SecurityUtils`** — `currentUser()`, `requireCurrentUserId()`, `canManage()`, `assertCanManage()`.

### 6.2 Authorization matrix (`@PreAuthorize`)

| Capability | ADMIN | PROVIDER | DEVELOPER | Anonymous |
|-----------|:-----:|:--------:|:---------:|:---------:|
| Register / login | ✅ | ✅ | ✅ | ✅ |
| Browse published APIs / categories / plans / reviews | ✅ | ✅ | ✅ | ✅ |
| Create/update/delete own API | ✅ (any) | ✅ (own) | ❌ | ❌ |
| Manage plans of API | ✅ (any) | ✅ (own) | ❌ | ❌ |
| Manage API keys of API | ✅ (any) | ✅ (own) | ❌ | ❌ |
| Subscribe to API (receive a key) | ✅ | ❌ | ✅ | ❌ |
| Write reviews | ✅ | ❌ | ✅ | ❌ |
| View own subscriptions/keys | ✅ | ✅* | ✅ | ❌ |
| Gateway forward (API-key auth) | ✅ | ✅ | ✅ | ✅ (valid key) |
| User administration | ✅ | ❌ | ❌ | ❌ |
| `/actuator/**` (except health) | ✅ | ❌ | ❌ | ❌ |

\* Providers are CRUD-only and do not consume APIs; the frontend encodes this via
`canConsume = isAuthenticated && !isProvider`.

### 6.3 Public endpoint allow-list (`SecurityConfig`)

- `POST /api/auth/register`, `POST /api/auth/login`
- `/v3/api-docs/**`, `/swagger-ui.html`, `/swagger-ui/**`
- `/actuator/health`, `/actuator/health/**` (all other `/actuator/**` requires ADMIN)
- `GET /api/apis`, `GET /api/apis/published`, `GET /api/apis/slug/**`,
  `GET /api/apis/*/plans/**`, `GET /api/apis/*/reviews`
- `GET /api/apis/{id:[0-9a-fA-F-]{36}}` — **UUID-constrained** so it cannot swallow the reserved
  sub-paths `/api/apis/all` (ADMIN) and `/api/apis/my` (PROVIDER). Those fall through to
  `authenticated()` so an anonymous caller receives **401**, not a 403 from `@PreAuthorize`.
- `GET /api/categories`, `/api/categories/**`
- All methods on `/api/gateway/**` (application-level auth via `X-API-Key`, not JWT)

Everything else requires authentication.

### 6.4 Gateway SSRF hardening

- Only `http`/`https` schemes; relative and protocol-relative URLs rejected.
- DNS resolution followed by rejection of any address in a private, loopback, link-local,
  carrier-grade-NAT or unique-local range (`OutboundUrlValidator`).
- Optional per-deployment upstream host allow-list via `app.gateway.allowed-hosts`.
- Hop-by-hop headers stripped in both directions; caller identity headers replaced with the platform's
  own; response body capped at `app.gateway.max-response-body-bytes`.
- `Accept-Encoding` is stripped inbound and forced to `identity` outbound, because
  `GatewayResponse.body` is a `String` and cannot carry an encoded payload faithfully. `gzip` and
  `deflate` responses are decompressed as a fallback (bounded, to resist decompression bombs);
  an unsupported encoding (`br`, `zstd`) is logged and passed through undecoded.
- Request-path traversal segments (`..`) rejected before forwarding.

### 6.5 Rate limiting (Redis)

- **Algorithm:** fixed-window counter; `INCR` + conditional `EXPIRE` executed as one Lua script so a
  concurrent caller cannot create a counter without a TTL.
- **Key shape:** `am:rl:{scope}:{bucket}` where `bucket = epochSeconds / windowSeconds`.
- **Limit source:** `Plan.rateLimit` + `Plan.ratePeriod.seconds()`, falling back to
  `app.ratelimit.default-limit` / `default-period-seconds` when a key has no plan.
- **On exceed:** `429 Too Many Requests` with `Retry-After` and `X-RateLimit-*` headers.
- **Failure policy:** `app.ratelimit.fail-open` — `true` (default, free tiers) allows traffic when Redis
  is unreachable; `false` (`RATE_LIMIT_FAIL_OPEN=false`, recommended in production) returns 429 so an
  outage cannot bypass quota.

---


## 7. REST API Reference

Base path `/api`. JSON bodies. Authenticated calls send `Authorization: Bearer <jwt>`; gateway calls
send `X-API-Key`. List endpoints return a `PageResponse<T>` envelope (`content`, `page`, `size`,
`totalElements`, `totalPages`) and accept Spring `Pageable` parameters, capped by
`app.pagination.max-page-size`.

### 7.1 Authentication — `/api/auth`

| Method | Path | Auth | Returns |
|--------|------|------|---------|
| POST | `/auth/register` | public | `201` `AuthResponse` |
| POST | `/auth/login` | public | `200` `AuthResponse` |

`AuthResponse`: `accessToken`, `tokenType`, `id`, `email`, `firstName`, `lastName`, `role`, `createdAt`.

### 7.2 APIs — `/api/apis`

| Method | Path | Access |
|--------|------|--------|
| GET | `/apis`, `/apis/published` | public (supports `categoryId`, `search`) |
| GET | `/apis/all` | ADMIN |
| GET | `/apis/my` | PROVIDER, ADMIN |
| GET | `/apis/{id}`, `/apis/slug/{slug}` | public (404 when not viewable) |
| POST | `/apis` | PROVIDER |
| PUT | `/apis/{id}` | PROVIDER (own), ADMIN |
| DELETE | `/apis/{id}` | PROVIDER (own), ADMIN |

### 7.3 API Keys — `/api`

| Method | Path | Access |
|--------|------|--------|
| GET | `/apis/{apiId}/keys` | PROVIDER (own), ADMIN |
| GET | `/apis/{apiId}/keys/{keyId}` | PROVIDER (own), ADMIN |
| GET | `/apis/{apiId}/keys/my` | DEVELOPER, ADMIN |
| GET | `/keys/my` | DEVELOPER, ADMIN |
| GET | `/keys/all` | ADMIN |
| POST | `/apis/{apiId}/keys` | PROVIDER (own) — returns `plaintextKey` once |
| PUT | `/apis/{apiId}/keys/{keyId}` | PROVIDER (own), ADMIN |
| POST | `/apis/{apiId}/keys/{keyId}/rotate` | PROVIDER (own), ADMIN — returns a new secret once |
| POST | `/apis/{apiId}/keys/{keyId}/revoke` | PROVIDER (own), ADMIN |
| DELETE | `/apis/{apiId}/keys/{keyId}` | PROVIDER (own), ADMIN |
| GET | `/apis/{apiId}/keys/{keyId}/usage` | PROVIDER (own), ADMIN |

### 7.4 Plans — `/api`

| Method | Path | Access |
|--------|------|--------|
| GET | `/apis/{apiId}/plans`, `/apis/{apiId}/plans/{planId}` | public |
| GET | `/plans/all` | ADMIN |
| POST | `/apis/{apiId}/plans` | PROVIDER (own) |
| PUT | `/apis/{apiId}/plans/{planId}` | PROVIDER (own), ADMIN |
| DELETE | `/apis/{apiId}/plans/{planId}` | PROVIDER (own), ADMIN (409 if referenced) |

### 7.5 Reviews — `/api`

| Method | Path | Access |
|--------|------|--------|
| GET | `/apis/{apiId}/reviews` | public |
| GET | `/reviews/all` | ADMIN |
| POST | `/apis/{apiId}/reviews` | DEVELOPER, ADMIN |
| PUT | `/apis/{apiId}/reviews/{reviewId}` | author, ADMIN |
| DELETE | `/apis/{apiId}/reviews/{reviewId}` | author, ADMIN |

### 7.6 Subscriptions — `/api`

| Method | Path | Access |
|--------|------|--------|
| GET | `/apis/{apiId}/subscriptions/my` | DEVELOPER, ADMIN |
| GET | `/me/subscriptions` | DEVELOPER, ADMIN |
| GET | `/apis/{apiId}/subscriptions` | PROVIDER (own), ADMIN |
| GET | `/subscriptions` | ADMIN |
| POST | `/apis/{apiId}/subscriptions?planId=` | DEVELOPER, ADMIN |
| PUT | `/apis/{apiId}/subscriptions/{subscriptionId}` | PROVIDER (own), ADMIN |
| PUT | `/subscriptions/{subscriptionId}` | ADMIN |
| DELETE | `/apis/{apiId}/subscriptions/{subscriptionId}` | DEVELOPER (own), ADMIN |
| DELETE | `/subscriptions/{subscriptionId}` | ADMIN |

### 7.7 Users — `/api/users`

| Method | Path | Access |
|--------|------|--------|
| GET | `/users/me` | authenticated |
| PUT | `/users/me` | authenticated |
| GET | `/users` | ADMIN |
| GET | `/users/developers` | PROVIDER, ADMIN |
| GET | `/users/{id}` | ADMIN |
| PUT | `/users/{id}` | ADMIN |
| DELETE | `/users/{id}` | ADMIN (409 while still owning records) |

### 7.8 Categories — `/api/categories`

| Method | Path | Access |
|--------|------|--------|
| GET | `/categories`, `/categories/{id}` | public |
| POST | `/categories` | ADMIN |
| PUT | `/categories/{id}` | ADMIN |
| DELETE | `/categories/{id}` | ADMIN (409 if assigned) |

### 7.9 Gateway — `/api/gateway`

```
ANY /api/gateway/forward/{apiId}[/{path}]
Headers:  X-API-Key: <key>   (required)
Returns:  GatewayResponse { status, statusText, contentType, body, latencyMs, truncated }
```

Flow: validate key → check Redis rate limit (`429` on exceed) → forward → enqueue telemetry job →
return the upstream response.

### 7.10 Error contract

```json
{ "timestamp": "2026-01-01T12:00:00", "status": 404, "message": "API not found", "errors": null }
```

| Exception | HTTP |
|-----------|------|
| `NotFoundException` | 404 |
| `ConflictException` / `DataIntegrityViolationException` | 409 |
| `BadRequestException` + malformed-request exceptions | 400 (+ field errors for validation) |
| `AuthenticationException` | 401 |
| `AccessDeniedException` — **anonymous caller** | 401 |
| `AccessDeniedException` — **authenticated caller** | 403 |
| `RateLimitExceededException` | 429 (+ `Retry-After`, `X-RateLimit-*`) |
| `HttpRequestMethodNotSupportedException` | 405 |
| `NoResourceFoundException` | 404 |
| `Exception` (fallback) | 500 |

`GlobalExceptionHandler.handleAccessDenied` inspects the authentication state: `@PreAuthorize` raises
`AccessDeniedException` for both anonymous and authenticated-but-unauthorised callers, and the two must
not be conflated — an anonymous caller receiving 403 would leak the endpoint's existence.

---


## 8. Service Layer Reference

| Service | Responsibility | Notable logic |
|---------|-----------------|---------------|
| `UserService` | Register/login, profile, admin user CRUD | BCrypt hashing, email normalisation, `ensureDeletable()` |
| `ApiService` | API CRUD + visibility masking | Slug uniqueness, `canView()`, cascading delete, cache invalidation |
| `PublicApiCacheReader` | Cache-backed reads of **publicly visible** APIs | Re-asserts `isPubliclyVisible()` on every populate; see §8.1 |
| `CategoryService` | Category CRUD | Unique name, refuse delete when referenced, cache invalidation |
| `PlanService` | Plan CRUD | Ownership checks, refuse delete when referenced, evicts `keyValidation` |
| `ReviewService` | Reviews + rating recompute | One review per user/API; `recalculateApiRating()` |
| `SubscriptionService` | Subscribe/cancel/update, key delegation | `assignApiKeyForSubscription()` / `releaseApiKeyForSubscription()` |
| `ApiKeyService` | Key CRUD, revoke, rotate, validate | `am_<uuid>` minting + SHA-256 storage, `validateApiKeyForApi()` → `ValidatedKey` |
| `UsageLogService` | Persist & read telemetry | `persist()` is `REQUIRES_NEW` (runs outside the request transaction) |
| `GatewayService` | Proxy HTTP to upstream | JDK `HttpClient`; 10s connect / 30s read; upstream 4xx/5xx returned verbatim |
| `RateLimitService` | Redis-backed rate limiting | Atomic Lua `INCR`/`EXPIRE`; `RateLimitExceededException` on exceed |
| `JwtService` | Token issue/verify | HS256, `role` claim |
| `CustomUserDetailsService` | `UserDetailsService` | Loads by email |

**Mapping convention:** services convert entities to immutable DTO records. Lazy associations are
dereferenced inside transactions (`spring.jpa.open-in-view=false`).

### 8.1 Caching (Redis)

| Cache | Key | TTL | Invalidation |
|-------|-----|-----|--------------|
| `apiCatalog` | `published:{cat}:{search}:{page}:{size}` / `id:{id}` / `slug:{slug}` | 60s | On API CUD |
| `categories` | `all` / `id:{id}` | 5 min | On category CUD |
| `plans` | `api:{apiId}` / `plan:{planId}` | 60s | On plan CUD |
| `keyValidation` | `key:{sha256digest}:{apiId}` | 10s | On revoke / rotate / delete / plan edit / subscription change / expiry sweep |
| `usageStats` | `usage:{apiKeyId}` | 60s | On subscription change / API delete |

- JSON serialisation (`GenericJackson2JsonRedisSerializer` with default typing enabled), key prefix
  `am:cache:v3:` — the version segment is bumped whenever the serialised form changes, so pre-existing
  keys are ignored rather than read and found unreadable.
- Cache failures are non-fatal (`CachingConfigurer.errorHandler()` logs and falls through to the DB).

#### Critical invariant — the catalog cache is principal-independent

`id:{id}` and `slug:{slug}` carry **no principal dimension**. Visibility is decided by
`ApiService.canView(...)`, which depends on the caller. Caching an `ApiResponse` *before* the
visibility check would let one caller's authorisation result be replayed to another: a provider
reading their own draft would populate the entry, and an anonymous request would then receive that
draft with a 200 — defeating the 404-masking rule.

The implementation enforces this structurally:

1. `ApiService.getApi` / `getApiBySlug` resolve and mask against the **current principal** first.
2. Only when `api.isPubliclyVisible()` is true do they delegate to `PublicApiCacheReader`, a separate
   bean so the `@Cacheable` proxy actually applies (self-invocation would bypass it).
3. `PublicApiCacheReader` re-checks `isPubliclyVisible()` before returning and refuses to cache
   anything else.

`ApiService.listPublished` is cacheable directly: it queries only published, non-private APIs, so its
payload is identical for every caller.

### 8.2 Background jobs (JobRunr)

- **Usage-log persistence** — enqueued per gateway request; also stamps `ApiKey.lastUsedAt`.
- **Rating recomputation** — after review changes.
- **API-key expiry sweep** (hourly) — sets `EXPIRED` where `expiresAt < now`; evicts `keyValidation`.
- **Subscription expiry sweep** (hourly) — sets `EXPIRED`; releases delegated keys.
- **Usage-log retention** (daily) — prunes rows older than `app.usage.retention-days`.

The JobRunr dashboard listens on its own port (default `8000`) and should be **disabled in
production** via `JOBRUNR_DASHBOARD_ENABLED=false` (there is no `prod` profile file, so this is an
environment variable rather than a profile default). Jobs are idempotent and retried with
exponential backoff; Redis must use a `noeviction` policy so job records are not silently dropped.

---


## 9. Frontend Architecture

### 9.1 Bootstrap (`src/main.jsx`)

```
<StrictMode>
  <Provider store={store}>
    <ErrorBoundary>
      <BrowserRouter>
        <App />
```

### 9.2 Styling (Tailwind CSS)

`tailwind.config.js` content globs cover `./index.html` and `./src/**/*.{js,jsx}`;
`postcss.config.js` registers `tailwindcss` + `autoprefixer`; `src/index.css` holds the directives plus
a `@layer components` block (`.btn`, `.card`, `.input`, `.badge`). Conventions: utility-first in JSX,
full class names only (no dynamic concatenation), responsive via `sm:`/`md:`/`lg:`.

### 9.3 Session & API client

- **`authSlice`** owns `token`, `user`, `isAuthenticated`, role flags; mirrors `am_access_token` /
  `am_user` to `localStorage`. Any 401 clears both (single logout path).
- **`src/api/client.js`** is the single HTTP boundary: `request(path, { method, body, headers, apiKey,
  auth, signal })`; injects `Authorization: Bearer` (unless `auth: false`), optional `X-API-Key`,
  JSON-encodes the body, normalises errors to `ApiError` with `.status` / `.data` / `.fieldErrors`, and
  maps `204` → `null`. Groups: `authApi`, `userApi`, `categoryApi`, `apiApi`, `planApi`, `reviewApi`,
  `subscriptionApi`, `apiKeyApi`, `gatewayApi`, plus `getToken` / `setToken` / `getStoredUser` /
  `setStoredUser` / `clearSession`.
- **`vite.config.js`** proxies `^/api/` → `http://localhost:8080` in dev.

### 9.4 Routing (`src/App.jsx`)

| Path | Page | Guard |
|------|------|-------|
| `/` | `HomePage` | public |
| `/login`, `/register` | `LoginPage`, `RegisterPage` | public |
| `/apis`, `/apis/:id`, `/categories` | `ApiListPage`, `ApiDetailPage`, `CategoriesPage` | public |
| `/profile` | `ProfilePage` | authenticated |
| `/me/subscriptions`, `/me/api-keys`, `/gateway` | `SubscriptionsPage`, `MyApiKeysPage`, `GatewayPage` | `denyRoles=['PROVIDER']` |
| `/my-apis` | `MyApisPage` | PROVIDER, ADMIN |
| `/apis/:apiId/plans`, `/apis/:apiId/keys`, `/apis/:apiId/subscriptions` | management views | PROVIDER, ADMIN |
| `/apis/:apiId/reviews` | `ReviewsPage` | authenticated |
| `/admin/users` | `UsersPage` | ADMIN |
| `/all/plans`, `/all/reviews` | `PlansPage`, `ReviewsPage` | ADMIN |
| `/manage/{plans,subscriptions,keys,reviews}` | → `/my-apis` | redirect |
| `*` | `NotFoundPage` | public |

`ProtectedRoute` redirects unauthenticated users to `/login` (preserving `from`) and enforces
`roles` (allow-list) / `denyRoles` (deny-list). Rendering a "not available" notice rather than
redirecting keeps the URL meaningful when a role check fails.

### 9.5 Component & page inventory

- **Components:** `Layout`, `ProtectedRoute`, `ErrorBoundary`, `ToastHost`, `ui.jsx` (Alert, Modal,
  ConfirmModal, Spinner, Skeleton, EmptyState, PageHeader, `formatDate`), `ApiFormModal`,
  `ApiViewModal`, `ManageApiShell`.
- **Pages:** Home, Login, Register, ApiList, ApiDetail, MyApis, Categories, Plans, Reviews,
  Subscriptions, ApiSubscriptions, ApiKeys, MyApiKeys, Users, Profile, Gateway, NotFound.

---

## 10. Frontend Testing Strategy

### 10.1 Tooling

Vitest (jsdom) + React Testing Library + `@testing-library/jest-dom` + `@testing-library/user-event`;
coverage via `@vitest/coverage-v8`.

### 10.2 Configuration (`vitest.config.js`)

`environment: 'jsdom'`, `globals: true`, `setupFiles: ['./tests/setup.js']`, `css: false`,
`clearMocks: true`. Coverage includes `src/**/*.{js,jsx}`, excludes `src/main.jsx`, colocated test files
and `tests/**`, and enforces **`lines/functions/statements ≥ 70`, `branches ≥ 60`**.

`tests/setup.js` registers jest-dom matchers, polyfills `matchMedia` / `ResizeObserver`, and clears
`localStorage` plus mocks after each test. `tests/utils/renderWithProviders.jsx` builds a fresh
`configureStore` (accepting `preloadedState`) inside a `MemoryRouter`.

### 10.3 Test taxonomy

| Scope | Location | Covers |
|-------|----------|--------|
| Unit | `tests/unit/` | Client contract, slice reducers, selectors, guard matrix, route probe |
| Component | `tests/component/` | `ui.jsx`, `ProtectedRoute`, `Layout`, `ManageApiShell`, pages |

### 10.4 Mocking strategy

- **Network boundary only.** `src/api/client.js` is mocked via `tests/utils/clientMock.js`
  (`vi.mock` with an explicit factory), never Redux or React Router.
- Real `configureStore` + real `MemoryRouter` so behaviour matches production.
- `localStorage` cleared per test; fake timers only where debounce/throttle is asserted.

### 10.5 Conventions

Query priority `getByRole` → `getByLabelText` → `getByPlaceholderText` → `getByText` → `getByTestId`
(last resort). Prefer `findBy*` over `waitFor`; use `userEvent`, not `fireEvent`. Assert what the user
sees, not internal state. One fresh store per test.


## 11. Configuration & Environment

### 11.1 Backend (`application.properties`)

| Property | Default | Env override |
|----------|---------|--------------|
| `server.port` | `8080` | `SERVER_PORT` |
| `spring.datasource.url` | `jdbc:postgresql://localhost:5432/api_marketplace` | `DB_URL` |
| `spring.datasource.username` / `.password` | `postgres` / `mysecretpassword` | `DB_USERNAME`, `DB_PASSWORD` |
| Hikari pool | max 10, min-idle 2, 30s connect, 600s idle, 1800s lifetime | `DB_POOL_*` |
| `spring.jpa.hibernate.ddl-auto` | `update` | `DB_DDL_AUTO` (set `validate` in prod) |
| `spring.jpa.open-in-view` | `false` | — |
| `spring.data.redis.host` / `.port` | `localhost` / `6379` | `REDIS_HOST`, `REDIS_PORT` |
| `spring.data.redis.password` | *(empty)* | `REDIS_PASSWORD` |
| `spring.cache.type` | `redis` | `CACHE_TYPE` |
| `app.jwt.secret` | dev default | `JWT_SECRET` (≥32 bytes; must be overridden in prod) |
| `app.jwt.expiration-ms` | `86400000` | `JWT_EXPIRATION_MS` |
| `app.cors.allowed-origins` | `http://localhost:5173,http://localhost:4173` | `CORS_ALLOWED_ORIGINS` |
| `app.ratelimit.default-limit` / `default-period-seconds` | `60` / `60` | `RATE_LIMIT_DEFAULT`, `RATE_LIMIT_PERIOD_SECONDS` |
| `app.ratelimit.fail-open` | `true` | `RATE_LIMIT_FAIL_OPEN` (set `false` in prod) |
| `app.gateway.connect-timeout-ms` / `read-timeout-ms` | `10000` / `30000` | `GATEWAY_*` |
| `app.gateway.max-response-body-bytes` | `1048576` | `GATEWAY_MAX_RESPONSE_BYTES` |
| `app.gateway.allowed-hosts` | *(empty)* | `GATEWAY_ALLOWED_HOSTS` |
| `app.pagination.max-page-size` | `100` | `MAX_PAGE_SIZE` |
| `app.usage.retention-days` | `90` | `USAGE_RETENTION_DAYS` |
| `jobrunr.background-job-server.enabled` | `true` | `JOBRUNR_SERVER_ENABLED` |
| `jobrunr.dashboard.enabled` | `true` | `JOBRUNR_DASHBOARD_ENABLED` (set `false` in prod) |
| Actuator exposure | `health,info` | `ACTUATOR_EXPOSURE` |
| Multipart limits | 10 MB file / 10 MB request | — |

There is **no** `application-prod.properties`; a single `application.properties` governs every
environment, and production behaviour is selected through environment variables rather than a
profile file. To run a production-shaped configuration, set `DB_DDL_AUTO=validate`, supply
`JWT_SECRET` and `CORS_ALLOWED_ORIGINS` explicitly (there are dev defaults, so a misconfigured
deployment will silently start with them), set `RATE_LIMIT_FAIL_OPEN=false`, set an explicit
`GATEWAY_ALLOWED_HOSTS`, and disable the JobRunr dashboard with `JOBRUNR_DASHBOARD_ENABLED=false`
and Swagger via `SPRINGDOC_SWAGGER_UI_ENABLED` / `SPRINGDOC_API_DOCS_ENABLED=false`, exposing
`ACTUATOR_EXPOSURE=health,info,prometheus` and reducing log verbosity with `LOGGING_LEVEL_*`.

### 11.2 Frontend

Dev server `5173` proxying `/api/` → `localhost:8080`; `BASE_URL = '/api'` in `src/api/client.js`.

---

## 12. End-to-End Flows

### 12.1 Registration & login

1. `POST /api/auth/register` creates a `DEVELOPER` (BCrypt) and returns a JWT.
2. The SPA stores token + user in `localStorage`; `authSlice` marks the session authenticated.
3. Subsequent requests attach `Authorization: Bearer <jwt>`.

### 12.2 Provider publishes an API, plan, and issues keys

1. `POST /api/apis` (starts `DRAFT`/`PRIVATE`).
2. `PUT /api/apis/{id}` sets `PUBLISHED`/`PUBLIC` → appears in listings; `apiCatalog` evicted.
3. `POST /apis/{apiId}/plans` defines pricing tiers.
4. `POST /apis/{apiId}/keys` seeds unassigned keys; the plaintext is shown once.

### 12.3 Developer subscribes and receives a key

1. `POST /apis/{apiId}/subscriptions?planId=...`.
2. Guards: plan belongs to the API; no existing subscription.
3. A pooled `ACTIVE` key is delegated (plan-first, then API pool); `409` if the pool is empty.
4. The developer sees the key prefix via `GET /keys/my`.

### 12.4 Gateway request + telemetry + rate limiting

1. `ANY /api/gateway/forward/{apiId}/{path}` with `X-API-Key`.
2. `validateApiKeyForApi` (cached 10s) checks existence, `ACTIVE`, expiry and API match.
3. `RateLimitService` consumes quota; on exceed → `429` with `Retry-After`.
4. `GatewayService` forwards (SSRF-validated) and measures latency.
5. A JobRunr job persists `UsageLog` and stamps `lastUsedAt`; the response is returned immediately.

### 12.5 Review & rating

Developer posts a review → rating recomputed → `apiCatalog` evicted.

### 12.6 Cancellation

`DELETE /apis/{apiId}/subscriptions/{subscriptionId}` → `CANCELLED`, `cancelledAt` set, key returned
to the pool (or `EXPIRED`).

### 12.7 Background jobs

Hourly key/subscription expiry sweeps; daily usage-log retention prune; on-demand rating recompute.

---

### 10.6 Scripts

```json
{ "dev": "vite", "build": "vite build", "preview": "vite preview", "lint": "eslint .",
  "test": "vitest run", "test:watch": "vitest", "test:coverage": "vitest run --coverage" }
```

### 10.7 Backend testing

`./mvnw verify` runs the unit suite plus a `@SpringBootTest` context-load check under the `test`

## 13. Cross-Cutting Concerns

- **Validation:** Jakarta Bean Validation on DTO records.
- **Errors:** one `@RestControllerAdvice`; consistent JSON; 401 vs 403 disambiguated; 429 carries
  `Retry-After`.
- **Transactions:** `@Transactional` on mutating services; telemetry persists in `REQUIRES_NEW`.
- **Cascades:** manual, ordered deletes to respect FK constraints.
- **Caching:** Redis via Spring Cache; explicit eviction; short TTLs; catalog cache limited to public
  records (§8.1).
- **Rate limiting:** Redis Lua counters per key + plan window.
- **Observability:** Actuator `health`/`info`/`prometheus`; JobRunr dashboard (dev only).
- **Security:** stateless JWT, BCrypt, method-level roles, 404 masking, no internal error leakage,
  10 MB caps, gateway SSRF controls, hashed API keys.
- **Data lifecycle:** 90-day raw telemetry retention; `ipAddress` and `userAgent` truncated on write.

### 13.1 Redis usage

| Purpose | Data structure | Key prefix |
|---------|----------------|------------|
| Cache | String (JSON) | `am:cache:v3:` |
| Rate limit | Counter (Lua) | `am:rl:` |
| JobRunr storage | Hash/List/Set | `jobrunr:` |

### 13.2 Quality gates (CI/CD)

- Backend: `./mvnw verify` (unit + context tests) with JaCoCo reporting; dependency scanning.
- Frontend: `npm run lint`, `npm run test:coverage`, `npm run build`, `npm audit`.
- Container: image scanning and SBOM generation.

---

## 14. Local Development & Run

### 14.1 Prerequisites

Java 17, Node 20, PostgreSQL 16, Redis 7 (or Docker).

### 14.2 Database & Redis

```bash
docker run -d --name am-db -e POSTGRES_DB=api_marketplace \
  -e POSTGRES_USER=postgres -e POSTGRES_PASSWORD=mysecretpassword -p 5432:5432 postgres:16-alpine
docker run -d --name am-redis -p 6379:6379 redis:7-alpine
```

### 14.3 Backend

```bash
cd backend
export JWT_SECRET="a-sufficiently-long-random-secret-value-32chars+"
./mvnw spring-boot:run            # :8080
# Swagger: http://localhost:8080/swagger-ui.html
# Health:  http://localhost:8080/actuator/health
```

### 14.4 Frontend

```bash
cd frontend
npm install
npm run dev                       # :5173, proxies /api → :8080
npm run test                      # Vitest
npm run test:coverage             # Vitest + v8 coverage
```

### 14.5 Docker Compose

`docker compose up --build` starts Postgres, Redis (with `noeviction`), the backend, and nginx serving
the SPA with a same-origin `/api` proxy. See `docker-compose.yml` and `.env.example`.

### 14.6 First admin

Registration always creates a `DEVELOPER`. Promote via SQL
(`UPDATE users SET role = 'ADMIN' WHERE email = '...';`) or via `PUT /api/users/{id}` once an admin
exists.

### 14.7 Tests

```bash
cd backend  && ./mvnw verify       # unit + context tests, JaCoCo report
cd frontend && npm run test        # Vitest + RTL
cd frontend && npm run test:coverage
```

---

## 15. Known Gaps & Remediation Backlog


## 16. Definition of Done for `v1`

- [x] Secrets externalized; CORS restricted to an explicit allow-list; production deployments must supply `JWT_SECRET` and `CORS_ALLOWED_ORIGINS` (the dev defaults are not safe).
- [x] API keys stored as SHA-256 hashes; plaintext returned once; rotation supported.
- [x] Gateway SSRF controls (scheme, address screening, host allow-list, header stripping, body cap).
- [x] Rate-limit failure policy documented and configurable (`fail-open`), with per-plan quotas.
- [x] Frontend test suite (Vitest + RTL) with coverage thresholds ≥70% lines / ≥60% branches.
- [x] Backend test suite (unit + `@SpringBootTest`) runnable with no infrastructure; JaCoCo reporting.
- [x] Docker Compose bring-up; runbook for deploy, rollback, key rotation and incidents.
- [ ] Schema under migration control (§15 #1).
- [ ] Enforced backend coverage threshold and end-to-end (Playwright) suite (§15 #2, #8).
- [ ] OpenAPI spec published as a build artifact in CI.

---

## 17. Glossary

| Term | Meaning |
|------|---------|
| **Provider** | `PROVIDER` — publishes and manages APIs, plans, and the API-key pool (CRUD-only). |
| **Developer** | `DEVELOPER` — discovers, subscribes to, reviews and consumes APIs. |
| **Admin** | `ADMIN` — global governance: users, categories, all APIs/keys/subs/reviews. |
| **API key pool** | Unassigned `api_keys` rows (`user = null`) that subscriptions draw from. |
| **Gateway** | `/api/gateway/forward/...` proxy forwarding traffic to upstream APIs and logging usage. |
| **Visibility** | `ApiVisibility` — `PUBLIC` (listable) vs `PRIVATE` (masked as 404). |
| **Rate limit** | Per-plan quota enforced at the gateway via Redis counters. |
| **JobRunr** | Distributed background job processor backed by Redis. |
| **Principal-independent cache** | A cache entry whose payload does not vary by caller; only such entries may be shared across principals. |
| **Tailwind CSS** | Utility-first CSS framework; sole styling system on the frontend. |
| **Redux Toolkit** | Official Redux toolset; single global store with slices and async thunks. |
| **Vitest** | Frontend test runner; jsdom environment; v8 coverage provider. |
| **React Testing Library** | Component testing library; user-centric queries and events. |
| **SSRF** | Server-Side Request Forgery — attacker-induced server requests to internal resources. |

---

*This document is maintained alongside the codebase; update it whenever schema, APIs, security
posture, or frontend architecture changes.*

**P0** = block production; **P1** = required first quarter; **P2** = roadmap.

| # | Priority | Gap | Recommendation |
|---|----------|-----|----------------|
| 1 | P0 | Schema migrations | `ddl-auto` is `update` in dev and set to `validate` in production via `DB_DDL_AUTO`, but no migration tool exists. Adopt Flyway/Liquibase so schema changes are versioned artefacts. |
| 2 | P0 | Backend coverage gate | JaCoCo reports are produced but no minimum is enforced. Add a `check` goal with thresholds. |
| 3 | P1 | Redis isolation/HA | Cache, rate-limit counters and JobRunr share one instance locally. Use separate logical DBs (or instances) and a non-`allkeys-lru` policy in production. |
| 4 | P1 | Pagination on remaining list reads | `/keys/my`, `/me/subscriptions` and per-API plan/review reads return unpaginated lists; bound them or document the ceiling. |
| 5 | P1 | Gateway latency metrics | Add a Micrometer timer per API/upstream so quota and latency dashboards share one source. |
| 6 | P1 | Correlation IDs | Propagate a request id through logs and the gateway's upstream headers. |
| 7 | P1 | Resilience | Consider circuit breakers/retries/bulkheads if upstream reliability warrants. |
| 8 | P1 | Frontend E2E | Add Playwright for the critical journeys against a real backend. |
| 9 | P2 | Usage analytics endpoints | Provider-facing aggregates beyond raw `UsageLog` listings. |
| 10 | P2 | Payments/billing | `Plan.price` is informational; integrate a payment processor. |
| 11 | P2 | Audit logging | Structured audit events for privileged actions. |
| 12 | P2 | Tailwind design tokens | Centralize brand palette, spacing and typography; document the dark-mode strategy. |

---

profile (`src/test/resources/application-test.properties`), which swaps PostgreSQL for in-memory H2,
Redis for a simple cache, disables the JobRunr server, and sets `app.ratelimit.fail-open=true` so the
suite needs no external infrastructure. JaCoCo reports are produced at `verify`.

---
