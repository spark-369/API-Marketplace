# API Marketplace

[![Backend](https://img.shields.io/badge/backend-Spring%20Boot%203.4.1%20%C2%B7%20Java%2017-6DB33F)](#technology-stack)
[![Frontend](https://img.shields.io/badge/frontend-React%2018%20%C2%B7%20Vite%206-61DAFB)](#technology-stack)
[![Database](https://img.shields.io/badge/database-PostgreSQL%2016%20%2B%20Redis%207-4169E1)](#architecture)
[![License](https://img.shields.io/badge/license-Proprietary-lightgrey)](#license)

**API Marketplace** is a full-stack platform where **providers** publish APIs, **developers** discover,
subscribe to, and consume them, and **admins** govern the marketplace. The backend additionally runs a
**gateway** that proxies runtime traffic to provider-owned upstream APIs — enforcing per-plan quotas and
recording usage telemetry for billing and analytics.

---

## Table of Contents

- [Overview](#overview)
- [Architecture](#architecture)
- [Technology Stack](#technology-stack)
- [Repository Layout](#repository-layout)
- [Quick Start](#quick-start)
  - [Option A — Docker Compose (recommended)](#option-a--docker-compose-recommended)
  - [Option B — Local development](#option-b--local-development)
  - [Bootstrapping the first administrator](#bootstrapping-the-first-administrator)
- [Core Concepts](#core-concepts)
- [Domain Model](#domain-model)
- [REST API Reference](#rest-api-reference)
- [Gateway](#gateway)
- [Configuration](#configuration)
- [Security](#security)
- [Background Jobs & Caching](#background-jobs--caching)
- [Testing & Quality Gates](#testing--quality-gates)
- [Operational Runbook](#operational-runbook)
- [Troubleshooting](#troubleshooting)
- [Documentation Index](#documentation-index)
- [License](#license)

---

## Overview

The platform solves the problem of **distributing, metering and monetising third-party APIs** behind a
single, consistent control plane. It has three audiences:

| Audience | Role | What they do |
|----------|------|--------------|
| Publishers | `PROVIDER` | Author APIs, define pricing plans, provision a pool of credentials, observe consumption |
| Consumers | `DEVELOPER` | Discover APIs, subscribe to a plan, receive a delegated key, call through the gateway |
| Operators | `ADMIN` | Govern users, categories, the entire catalog, quotas, and platform-wide telemetry |

### Key capabilities

- **JWT authentication** (register / login) with role-based authorization and method-level guards.
- **API catalog** with categories, pricing plans, reviews and average-rating aggregation.
- **Subscriptions** that *delegate* a credential from a provider-managed **key pool**.
- **Runtime gateway** that forwards traffic to upstream APIs and logs per-request usage telemetry.
- **Redis-backed rate limiting** at the gateway, enforced per API key against the plan quota.
- **Redis-backed caching** for hot public reads (catalog, categories, plans, key validation).
- **JobRunr** background jobs (retention pruning, expiry sweeps, rating recomputation).
- **OpenAPI/Swagger** docs, **Actuator** health + **Prometheus** metrics, HikariCP pooling, a single
  centralised error contract, and a frontend test suite with enforced coverage thresholds.

---

## Architecture

```
┌───────────────┐   /api/*    ┌──────────────────────────────┐
│  React SPA    │────────────▶│  Spring Boot backend :8080   │
│  :5173        │             │  JWT · RBAC · Gateway        │
└───────────────┘             └───────┬──────────────┬───────┘
                                      │              │
                              PostgreSQL 16      Redis 7
                              (catalog)          (cache, rate limits, jobs)
                                      │
                                      ▼
                            upstream provider APIs
```

The frontend is a thin, stateless SPA. The backend owns **all** authority: authentication,
authorization, quota enforcement, credential hashing and telemetry. Redis is a shared dependency for
three distinct concerns — **cache**, **rate-limit counters**, and **JobRunr storage** — which is why
the bundled Redis configuration mandates `noeviction` (see [Background Jobs & Caching](#background-jobs--caching)).

### Request lifecycle (a gateway call)

```
Client ──X-API-Key──▶ GatewayController
   1. Validate the key against the API in the path (cached 10s)
   2. Consume the plan quota via a Redis Lua counter ── 429 + Retry-After on exceed
   3. Forward to the upstream API (SSRF-validated)
   4. Persist telemetry for the attempt (own REQUIRES_NEW transaction)
   5. Return the upstream response verbatim
```

---

## Technology Stack

### Backend (`backend/pom.xml`)

| Concern | Choice |
|---------|--------|
| Framework | Spring Boot **3.4.1** (parent POM), **Java 17** |
| Web | `spring-boot-starter-web` |
| Persistence | `spring-boot-starter-data-jpa` + PostgreSQL driver (H2 for tests) |
| Cache / Rate limit | `spring-boot-starter-data-redis` (Lettuce) + `spring-boot-starter-cache` |
| Background jobs | `jobrunr-spring-boot-3-starter` **7.3.2** (Redis-backed) |
| Security | `spring-boot-starter-security` + `spring-security-test` |
| Validation | `spring-boot-starter-validation` |
| Ops | `spring-boot-starter-actuator` + `micrometer-registry-prometheus` |
| JWT | jjwt **0.12.6** (`jjwt-api` / `jjwt-impl` / `jjwt-jackson`) |
| API docs | springdoc-openapi **2.7.0** |
| Coverage | JaCoCo **0.8.12** (`prepare-agent` + `report` bound to `verify`) |

> **Intentionally not used:** Flyway/Liquibase, Resilience4j, OpenTelemetry tracing. Schema changes
> are applied out-of-band in production and validated at boot with `DB_DDL_AUTO=validate`.

### Frontend (`frontend/package.json`)

| Concern | Choice |
|---------|--------|
| Language | JavaScript (ES2022+) — no TypeScript |
| UI | React **18** + React DOM |
| Routing | `react-router-dom` **7** |
| State | Redux Toolkit **2** + `react-redux` **9** |
| Styling | Tailwind CSS **3** via PostCSS + autoprefixer |
| Build | Vite **6** + `@vitejs/plugin-react` |
| HTTP | Native `fetch`, wrapped in `src/api/client.js` |
| Testing | Vitest **2** (jsdom) + React Testing Library + jest-dom + user-event |
| Coverage | `@vitest/coverage-v8` |
| Lint | ESLint **9** + react-hooks + react-refresh |

---

## Repository Layout

```
.
├── README.md                                # This document
├── .env.example                             # Environment template — copy to .env
├── docker-compose.yml                       # One-command local stack
├── docs/
│   ├── RUNBOOK.md                           # Deploy, rollback, key rotation, incidents
│   └── System_Blueprint.md                  # Full system design reference
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
│       ├── main/resources/application.properties
│       └── test/                            # Unit + context tests
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
    └── tests/                               # setup.js · unit/ · component/
```

---

## Quick Start

### Prerequisites

| Tool | Version |
|------|---------|
| Docker + Docker Compose | any current release (Option A) |
| Java (JDK) | **17** |
| Node.js | **20** |
| PostgreSQL | **16** |
| Redis | **7** |

### Option A — Docker Compose (recommended)

```bash
cp .env.example .env
# Edit .env and set a real JWT_SECRET (>= 32 bytes)
docker compose up --build
```

| Service | URL |
|---------|-----|
| SPA | http://localhost:5173 |
| API | http://localhost:8080 |
| Swagger UI | http://localhost:8080/swagger-ui.html |
| OpenAPI JSON | http://localhost:8080/v3/api-docs |
| JobRunr dashboard | http://localhost:8000/dashboard |
| Health | http://localhost:8080/actuator/health |

nginx serves the SPA and proxies `/api/*` to the backend on the **same origin**, so no CORS
configuration is involved in this topology. The compose stack also starts Postgres and Redis with
health checks, and the backend waits for both to be healthy before it boots.

### Option B — Local development

```bash
# 1. Infrastructure
docker run -d --name am-db  -e POSTGRES_DB=api_marketplace \
  -e POSTGRES_USER=postgres -e POSTGRES_PASSWORD=mysecretpassword -p 5432:5432 postgres:16-alpine
docker run -d --name am-redis -p 6379:6379 redis:7-alpine

# 2. Backend (:8080) — the dev server proxies /api to it
cd backend
export JWT_SECRET="a-sufficiently-long-random-secret-value-32chars+"
./mvnw spring-boot:run

# 3. Frontend (:5173, proxies /api → :8080)
cd frontend
npm install
npm run dev
```

Generate a safe secret with:

```bash
openssl rand -base64 48
```

### Bootstrapping the first administrator

Self-service registration **always** creates a `DEVELOPER` (or `PROVIDER` on request); the `ADMIN`
role is never grantable through the public API. Promote your first account directly:

```sql
UPDATE users SET role = 'ADMIN' WHERE email = 'you@example.com';
```

Once one administrator exists, further roles can be changed through `PUT /api/users/{id}`.

---

## Core Concepts

**Roles.** `ADMIN` governs everything. `PROVIDER` publishes APIs, defines plans and owns a key pool —
but never consumes APIs, so a publisher cannot be its own customer for quota purposes. `DEVELOPER`
discovers, subscribes, reviews and consumes.

**API keys are hashed, never stored.** A key is minted as `am_<uuid>`; only its SHA-256 digest is
persisted (`ApiKey.keyHash`), alongside a short display prefix (`keyPrefix`, e.g. `am_1a2b3c4d`). The
plaintext is returned exactly once — at creation or rotation — and cannot be retrieved afterwards, so
a database disclosure cannot be replayed against the gateway.

**The key pool.** Providers provision unassigned keys (`user = null`). A subscription *delegates* one
from that pool; cancelling returns it. If the pool is empty, subscribing fails with **409** rather than
handing out an unusable credential.

**Visibility masking.** An API that is not publicly visible *and* not owned by the caller returns
**404, not 403**, so status codes cannot be used to enumerate draft or private APIs. An API is publicly
listable iff `status == PUBLISHED` **and** `visibility != PRIVATE`.

**Quota.** `Plan.rateLimit` + `ratePeriod` define a fixed window enforced by an atomic Redis counter
at the gateway. Exceeding it returns **429** with `Retry-After` and `X-RateLimit-*` headers. When Redis
is unreachable the service either fails open or closed, per `RATE_LIMIT_FAIL_OPEN`.

**Gateway SSRF controls.** A provider's `baseUrl` is untrusted input. The gateway allows only
`http`/`https`, optionally restricts hosts via `GATEWAY_ALLOWED_HOSTS`, resolves DNS and rejects any
address in a private, loopback, link-local, carrier-grade-NAT or unique-local range, strips hop-by-hop
headers, and caps response body size.

---

## Domain Model

All entities extend `BaseEntity` (`@MappedSuperclass`): a `UUID id` (`@UuidGenerator`,
`updatable = false`) plus `createdAt` / `updatedAt` maintained by `@PrePersist` / `@PreUpdate`.

| Entity | Table | Key fields | Relationships |
|--------|-------|------------|---------------|
| **User** | `users` | `email` (unique), `password` (BCrypt), `firstName`, `lastName`, `role`, `bio`, `avatarUrl` | implements `UserDetails` |
| **Api** | `apis` | `name`, `slug` (unique), `description`, `baseUrl`, `documentationUrl`, `status`, `visibility`, `version`, `averageRating`, `reviewCount` | `category` (M:1, optional), `owner` (M:1 → User, required) |
| **Category** | `categories` | `name` (unique), `description` | — |
| **Plan** | `plans` | `name`, `description`, `price`, `rateLimit`, `ratePeriod`, `supportLevel` | `api` (M:1, required); unique `(api_id, name)` |
| **Review** | `reviews` | `rating` (1–5), `title`, `comment` | `api` (M:1), `user` (M:1); unique `(api_id, user_id)` |
| **Subscription** | `subscriptions` | `status`, `startedAt`, `expiresAt`, `cancelledAt` | `user` (M:1), `api` (M:1), `plan` (M:1, optional) |
| **ApiKey** | `api_keys` | `keyHash` (unique, SHA-256 hex), `keyPrefix`, `name`, `status`, `expiresAt`, `lastUsedAt` | `user` (M:1, nullable = pool), `api` (M:1), `plan` (M:1, optional) |
| **UsageLog** | `usage_logs` | `endpoint`, `method`, `statusCode`, `latencyMs`, `ipAddress`, `userAgent` | `apiKey` (M:1, required) |

### Enumerations

| Enum | Values | Default |
|------|--------|---------|
| `Role` | `ADMIN`, `PROVIDER`, `DEVELOPER` | `DEVELOPER` |
| `ApiStatus` | `DRAFT`, `PUBLISHED`, `ARCHIVED` | `DRAFT` |
| `ApiVisibility` | `PUBLIC`, `PRIVATE` | `PRIVATE` |
| `ApiKeyStatus` | `ACTIVE`, `REVOKED`, `EXPIRED` | `ACTIVE` |
| `SubscriptionStatus` | `ACTIVE`, `CANCELLED`, `EXPIRED` | `ACTIVE` |
| `RatePeriod` | `SECOND`, `MINUTE`, `HOUR`, `DAY`, `MONTH` | — |

All enums persist as strings (`@Enumerated(EnumType.STRING)`).

## REST API Reference

Base path `/api`. Request and response bodies are JSON. Authenticated calls send
`Authorization: Bearer <jwt>`; gateway calls send `X-API-Key`. List endpoints return a
`PageResponse<T>` envelope (`content`, `page`, `size`, `totalElements`, `totalPages`) and accept Spring
`Pageable` parameters (`page`, `size`, `sort`), capped by `app.pagination.max-page-size`.

### Authentication — `/api/auth`

| Method | Path | Access | Returns |
|--------|------|--------|---------|
| POST | `/auth/register` | public | `201` `AuthResponse` |
| POST | `/auth/login` | public | `200` `AuthResponse` |

`AuthResponse`: `accessToken`, `tokenType`, `id`, `email`, `firstName`, `lastName`, `role`, `createdAt`.

### APIs — `/api/apis`

| Method | Path | Access |
|--------|------|--------|
| GET | `/apis`, `/apis/published` | public (supports `categoryId`, `search`) |
| GET | `/apis/all` | ADMIN |
| GET | `/apis/my` | PROVIDER, ADMIN |
| GET | `/apis/{id}`, `/apis/slug/{slug}` | public (returns 404 when not viewable) |
| POST | `/apis` | PROVIDER — new APIs default to `DRAFT` + `PRIVATE` |
| PUT | `/apis/{id}` | PROVIDER (own), ADMIN |
| DELETE | `/apis/{id}` | PROVIDER (own), ADMIN — cascades to plans, keys, subscriptions, reviews |

### API Keys — `/api`

| Method | Path | Access |
|--------|------|--------|
| GET | `/apis/{apiId}/keys` | PROVIDER (own), ADMIN |
| GET | `/apis/{apiId}/keys/{keyId}` | PROVIDER (own), ADMIN |
| GET | `/apis/{apiId}/keys/my` | DEVELOPER, ADMIN |
| GET | `/keys/my` | DEVELOPER, ADMIN |
| GET | `/keys/all` | ADMIN |
| POST | `/apis/{apiId}/keys` | PROVIDER (own) — returns `plaintextKey` **once** |
| PUT | `/apis/{apiId}/keys/{keyId}` | PROVIDER (own), ADMIN |
| POST | `/apis/{apiId}/keys/{keyId}/rotate` | PROVIDER (own), ADMIN — returns a new secret **once** |
| POST | `/apis/{apiId}/keys/{keyId}/revoke` | PROVIDER (own), ADMIN |
| DELETE | `/apis/{apiId}/keys/{keyId}` | PROVIDER (own), ADMIN |
| GET | `/apis/{apiId}/keys/{keyId}/usage` | PROVIDER (own), ADMIN — usage telemetry |

### Plans — `/api`

| Method | Path | Access |
|--------|------|--------|
| GET | `/apis/{apiId}/plans`, `/apis/{apiId}/plans/{planId}` | public |
| GET | `/plans/all` | ADMIN |
| POST | `/apis/{apiId}/plans` | PROVIDER (own) — `rateLimit` + `ratePeriod` define the quota |
| PUT | `/apis/{apiId}/plans/{planId}` | PROVIDER (own), ADMIN |
| DELETE | `/apis/{apiId}/plans/{planId}` | PROVIDER (own), ADMIN — 409 while referenced |

### Reviews — `/api`

| Method | Path | Access |
|--------|------|--------|
| GET | `/apis/{apiId}/reviews` | public |
| GET | `/reviews/all` | ADMIN |
| POST | `/apis/{apiId}/reviews` | DEVELOPER, ADMIN — one review per account per API (409 on duplicate) |
| PUT | `/apis/{apiId}/reviews/{reviewId}` | author, ADMIN |
| DELETE | `/apis/{apiId}/reviews/{reviewId}` | author, ADMIN |

### Subscriptions — `/api`

| Method | Path | Access |
|--------|------|--------|
| GET | `/apis/{apiId}/subscriptions/my` | DEVELOPER, ADMIN |
| GET | `/me/subscriptions` | DEVELOPER, ADMIN |
| GET | `/apis/{apiId}/subscriptions` | PROVIDER (own), ADMIN |
| GET | `/subscriptions` | ADMIN |
| POST | `/apis/{apiId}/subscriptions?planId=` | DEVELOPER, ADMIN — delegates a key; 409 if pool empty |
| PUT | `/apis/{apiId}/subscriptions/{subscriptionId}` | PROVIDER (own), ADMIN |
| PUT | `/subscriptions/{subscriptionId}` | ADMIN |
| DELETE | `/apis/{apiId}/subscriptions/{subscriptionId}` | DEVELOPER (own), ADMIN — returns the key |
| DELETE | `/subscriptions/{subscriptionId}` | ADMIN |

### Users — `/api/users`

| Method | Path | Access |
|--------|------|--------|
| GET | `/users/me` | authenticated |
| PUT | `/users/me` | authenticated (partial update) |
| GET | `/users` | ADMIN |
| GET | `/users/developers` | PROVIDER, ADMIN |
| GET | `/users/{id}` | ADMIN |
| PUT | `/users/{id}` | ADMIN — a blank password leaves the credential unchanged |
| DELETE | `/users/{id}` | ADMIN — 409 while still owning records |

### Categories — `/api/categories`

| Method | Path | Access |
|--------|------|--------|
| GET | `/categories`, `/categories/{id}` | public |
| POST | `/categories` | ADMIN |
| PUT | `/categories/{id}` | ADMIN |
| DELETE | `/categories/{id}` | ADMIN — 409 if assigned |

### Authorization matrix

| Capability | ADMIN | PROVIDER | DEVELOPER | Anonymous |
|-----------|:-----:|:--------:|:---------:|:---------:|
| Register / login | ✅ | ✅ | ✅ | ✅ |
| Browse published APIs / categories / plans / reviews | ✅ | ✅ | ✅ | ✅ |
| Create / update / delete an API | ✅ (any) | ✅ (own) | ❌ | ❌ |
| Manage plans of an API | ✅ (any) | ✅ (own) | ❌ | ❌ |
| Manage API keys of an API | ✅ (any) | ✅ (own) | ❌ | ❌ |
| Subscribe to an API (receive a key) | ✅ | ❌ | ✅ | ❌ |
| Write reviews | ✅ | ❌ | ✅ | ❌ |
| View own subscriptions / keys | ✅ | ✅* | ✅ | ❌ |
| Gateway forward (`X-API-Key` auth) | ✅ | ✅ | ✅ | ✅ (valid key) |
| User administration | ✅ | ❌ | ❌ | ❌ |
| `/actuator/**` (except health) | ✅ | ❌ | ❌ | ❌ |

\* Providers are CRUD-only and do not consume APIs; the frontend encodes this via
`canConsume = isAuthenticated && !isProvider`.

### Error contract

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

`GlobalExceptionHandler` inspects the authentication state so an anonymous caller denied by
`@PreAuthorize` receives **401** rather than 403 — returning 403 would leak the endpoint's existence.

---

## Gateway

```
ANY /api/gateway/forward/{apiId}[/{path}]
Headers:  X-API-Key: <key>   (required)
Returns:  GatewayResponse { status, statusText, contentType, body, latencyMs, truncated }
```

The trailing path segment is optional: `/forward/{apiId}` targets the base URL itself while
`/forward/{apiId}/v1/weather` appends a sub-path.

**Pipeline:** validate key → check the Redis rate limit (`429` on exceed) → forward (SSRF-validated) →
persist telemetry → return the upstream response verbatim.

**Hardening controls**

- Only `http`/`https` schemes; relative and protocol-relative URLs rejected.
- DNS resolution followed by rejection of any address in a private, loopback, link-local,
  carrier-grade-NAT or unique-local range (`OutboundUrlValidator`).
- Optional per-deployment upstream host allow-list via `app.gateway.allowed-hosts`.
- Hop-by-hop headers stripped in both directions; caller identity headers
  (`X-Forwarded-For` / `-Host` / `-Proto`) replaced with the platform's own.
- Response body capped at `app.gateway.max-response-body-bytes`.
- `Accept-Encoding` is stripped inbound and forced to `identity` outbound, because
  `GatewayResponse.body` is a `String`. `gzip` / `deflate` responses are decompressed as a bounded
  fallback; unsupported encodings (`br`, `zstd`) are logged and passed through undecoded.
- Request-path traversal segments (`..`) rejected before forwarding.

> **Known limitation:** `GatewayResponse.body` is text, so **binary** upstream responses (images, PDFs,
> protobuf) cannot be relayed faithfully. See `docs/RUNBOOK.md` §7.

---

## Testing & Quality Gates

```bash
cd backend  && ./mvnw verify              # unit + context tests, JaCoCo report
cd frontend && npm run lint               # ESLint
cd frontend && npm run test               # Vitest + React Testing Library
cd frontend && npm run test:coverage      # enforces ≥70% lines / ≥60% branches
cd frontend && npm run build              # production bundle
```

The backend suite runs with **no external infrastructure** (H2 in-memory database) and includes a
`@SpringBootTest` context-load check. The frontend suite mocks only `src/api/client.js` — the single
network boundary — and otherwise exercises real reducers, real routing and real DOM events.

**CI/CD quality gates**

- Backend: `./mvnw verify` (unit + context tests) with JaCoCo reporting; dependency scanning.
- Frontend: `npm run lint`, `npm run test:coverage`, `npm run build`, `npm audit`.
- Container: image scanning and SBOM generation.

---

## Configuration

Everything is environment-driven. Copy `.env.example` to `.env` and adjust; see that file for the full
list. The settings that matter most in production:

| Variable | Why |
|----------|-----|
| `JWT_SECRET` | ≥ 32 bytes (HS256 requires a 256-bit key). The app refuses to start otherwise. |
| `CORS_ALLOWED_ORIGINS` | Explicit allow-list. `*` is development-only and never combined with credentials. |
| `GATEWAY_ALLOWED_HOSTS` | Restricts which upstream hosts the gateway may reach. |
| `RATE_LIMIT_FAIL_OPEN` | `false` for paid tiers so a Redis outage cannot become a quota bypass. |
| `DB_DDL_AUTO` | Set to `validate` in production to fail fast on schema drift. |
| `JOBRUNR_DASHBOARD_ENABLED` | `false` closes the JobRunr dashboard port in production. |
| `SPRINGDOC_API_DOCS_ENABLED` / `SPRINGDOC_SWAGGER_UI_ENABLED` | `false` disables Swagger in production. |
| `ACTUATOR_EXPOSURE` | `health,info,prometheus` to expose metrics in production. |

> There is **no `application-prod.properties`**. A single `application.properties` governs every
> environment, and production behaviour is selected entirely through environment variables. Because
> development defaults exist, a misconfigured deployment will silently start with them.

### Backend property reference (`application.properties`)

| Property | Default | Env override |
|----------|---------|--------------|
| `server.port` | `8080` | `SERVER_PORT` |
| `spring.datasource.url` | `jdbc:postgresql://localhost:5432/api_marketplace` | `DB_URL` |
| `spring.datasource.username` / `.password` | `postgres` / `mysecretpassword` | `DB_USERNAME`, `DB_PASSWORD` |
| Hikari pool | max 10, min-idle 2, 30s connect, 600s idle, 1800s lifetime | `DB_POOL_*` |
| `spring.jpa.hibernate.ddl-auto` | `update` | `DB_DDL_AUTO` (set `validate` in prod) |
| `spring.jpa.open-in-view` | `false` | — |
| `spring.data.redis.host` / `.port` | `localhost` / `6379` | `REDIS_HOST`, `REDIS_PORT` |
| `spring.cache.type` | `redis` | `CACHE_TYPE` |
| `app.jwt.secret` | dev default | `JWT_SECRET` (≥ 32 bytes) |
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

### Frontend

The Vite dev server runs on `5173` and proxies `/api/` → `localhost:8080`. `BASE_URL = '/api'` in
`src/api/client.js`.

---

## Security

- **Authentication:** stateless JWT (HS256), `role` claim; passwords hashed with BCrypt.
- **Authorization:** method-level `@PreAuthorize` role checks plus ownership assertions inside the
  service layer.
- **Credential storage:** API keys persist only as SHA-256 hashes; the plaintext is shown once.
- **Information hiding:** 404 masking for non-viewable APIs; 401 vs 403 disambiguated; no internal
  error or stack-trace leakage (`server.error.*` disabled).
- **Public endpoint allow-list:** auth routes, OpenAPI/Swagger, `/actuator/health`, public catalog
  reads (`GET /api/apis/{uuid}` is UUID-constrained so it cannot swallow `/apis/all` or `/apis/my`),
  categories, and `/api/gateway/**` (key-authenticated). Everything else requires authentication.
- **Gateway:** SSRF hardening, header stripping, request/response size caps (10 MB).
- **Data lifecycle:** 90-day raw telemetry retention; `ipAddress` and `userAgent` truncated on write.

For the full security design see `docs/System_Blueprint.md` §6.

---

## Background Jobs & Caching

### Caching (Redis)

| Cache | Key | TTL | Invalidated on |
|-------|-----|-----|----------------|
| `apiCatalog` | `published:{cat}:{search}:{page}:{size}` / `id:{id}` / `slug:{slug}` | 60s | API CUD |
| `categories` | `all` / `id:{id}` | 5 min | Category CUD |
| `plans` | `api:{apiId}` / `plan:{planId}` | 60s | Plan CUD |
| `keyValidation` | `key:{sha256digest}:{apiId}` | 10s | revoke / rotate / delete / plan edit / subscription change / expiry sweep |
| `usageStats` | `usage:{apiKeyId}` | 60s | subscription change / API delete |

- Key prefix `am:cache:v2:` — the version segment is bumped whenever the serialised form changes.
- Cache failures are **non-fatal**: the error handler logs and falls through to the database.

> **Critical invariant:** the catalog cache is **principal-independent**. `id:{id}` / `slug:{slug}`
> carry no caller dimension, so only publicly visible APIs are ever cached — `PublicApiCacheReader`
> re-checks `isPubliclyVisible()` on every populate. Adding a write path that caches an `ApiResponse`
> without that guard would let one caller's authorisation result leak to another.

### Background jobs (JobRunr)

| Job | Schedule | Purpose |
|-----|----------|---------|
| Usage-log persistence | per gateway request | Records telemetry and stamps `ApiKey.lastUsedAt` |
| Rating recomputation | after review changes | Recomputes `averageRating` / `reviewCount` |
| API-key expiry sweep | hourly | Marks keys `EXPIRED`; evicts `keyValidation` |
| Subscription expiry sweep | hourly | Marks subscriptions `EXPIRED`; releases delegated keys |
| Usage-log retention | daily | Prunes rows older than `app.usage.retention-days` |

The JobRunr dashboard listens on its own port (default `8000`) and **must be disabled in production**
(`JOBRUNR_DASHBOARD_ENABLED=false`). Jobs are idempotent and retried with exponential backoff. Redis
must use a `noeviction` policy so job records are not silently dropped — the bundled compose file sets
this deliberately.

---

## Operational Runbook

Day-to-day operations are documented in **[`docs/RUNBOOK.md`](docs/RUNBOOK.md)**:

1. Deploy — pre-flight checks, rollout, verification
2. Rollback — including the schema caveat
3. API key rotation — customer keys and platform secrets
4. Rate limiting — diagnosing 429s and Redis outages
5. Background jobs — JobRunr operations
6. Database — backup and restore
7. Gateway — diagnosing upstream failures
8. Common incidents
9. Health and observability

### Health & observability endpoints

| Endpoint | Purpose |
|----------|---------|
| `/actuator/health` | Liveness/readiness, including `db` and `redis` components |
| `/actuator/info` | Build metadata |
| `/actuator/prometheus` | Metrics (production profile only) |

Key log lines to alert on:

| Pattern | Meaning |
|---------|---------|
| `Failed to enqueue usage-log job` | JobRunr or Redis problem; telemetry is being lost |
| `Rate limiter unavailable` | Redis unreachable; check the fail-open policy's effect |
| `Blocked SSRF attempt` | Security event — investigate the source API |
| `409 data integrity violation` | A unique constraint fired; usually a race on a duplicate |
| `500 on` | Unhandled exception; the full stack trace follows in the same log entry |

---

## Troubleshooting

| Symptom | Likely cause & fix |
|---------|--------------------|
| Backend refuses to start | `JWT_SECRET` is missing or shorter than 32 bytes — generate one with `openssl rand -base64 48`. |
| `409 No API keys are currently available` on subscribe | The provider's key pool is empty. The provider must `POST /apis/{apiId}/keys`. |
| Legitimate customer receiving `429` | Inspect `redis-cli --scan --pattern 'am:rl:{apiKeyId}:*'` and raise the plan's `rateLimit` via `PUT /apis/{apiId}/plans/{planId}`. |
| Everyone signed out at once | `JWT_SECRET` changed or differs between instances — expected after a rotation. |
| Stale catalog data beyond a minute | A write path is missing its `@CacheEvict`. `redis-cli FLUSHDB` clears the cache immediately. |
| `400 The upstream API could not be reached` | The upstream is unreachable or blocked by SSRF screening; check `GATEWAY_ALLOWED_HOSTS` and the provider's `baseUrl`. |

---

## Documentation Index

- [`docs/RUNBOOK.md`](docs/RUNBOOK.md) — deploy, rollback, key rotation, incident procedures.
- [`docs/System_Blueprint.md`](docs/System_Blueprint.md) — full system design reference: architecture,
  domain model, security, API reference, frontend, testing and operations.

---

## License

Proprietary. All rights reserved. See the owning organisation for licensing terms.
