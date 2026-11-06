# Runbook

Operational procedures for the API Marketplace. Every section assumes you have credentials for the
target environment and the ability to run `docker compose`, `kubectl`, or direct `psql`/`redis-cli`
against it.

---

## 1. Deploy

### Pre-flight

```bash
# 1. The build must be green on the exact commit being deployed.
cd backend  && ./mvnw verify
cd frontend && npm run lint && npm run test:coverage && npm run build

# 2. Confirm the schema matches the entity model before the new code starts.
#    Set DB_DDL_AUTO=validate in the target environment so a mismatch fails fast at boot
#    rather than at the first request. (There is no application-prod.properties; production
#    behaviour comes from environment variables.)
```

### Deploy

```bash
git pull
docker compose up -d --build
docker compose logs -f backend | head -100
```

### Verify

```bash
curl -fsS http://<host>:8080/actuator/health | jq
```

Expect `{"status":"UP"}`. `db` and `redis` appear under `components`.

Then confirm the three critical paths manually:

1. `POST /api/auth/login` returns a token.
2. `GET /api/apis` returns a catalog page.
3. A gateway call with a valid `X-API-Key` returns the upstream body; a call with a garbage key
   returns `404`.

---

## 2. Rollback

```bash
docker compose down
git checkout <previous-good-sha>
docker compose up -d --build
```

**Schema caveat.** Rolling back application code does *not* roll back the database. If the release
included a migration, verify it is backward compatible (additive only) before rolling back. A
destructive migration requires restoring from backup — see §6.

---

## 3. API key rotation

### Rotating a customer's key

Use the API, never the database. Rotation overwrites the stored hash in place, so the previous secret
stops working immediately.

```
POST /api/apis/{apiId}/keys/{keyId}/rotate
Authorization: Bearer <provider-or-admin-jwt>
```

The response contains the new plaintext **once**. Deliver it over a secure channel; it cannot be
retrieved again.

### Rotating the platform's own secrets

**`JWT_SECRET`** — rotating this invalidates every issued token, signing all users out.

```bash
openssl rand -base64 48          # generate
docker compose down backend
# update JWT_SECRET in .env
docker compose up -d backend
```

Plan for the user-visible effect: everyone must sign in again. Rotate after a suspected compromise,
not on a schedule, unless the business accepts the disruption.

**Database and Redis credentials** — update the secret store, then restart the backend; they are read
at boot only.

---

## 4. Rate limiting

### Symptom: legitimate customers receiving 429

```bash
redis-cli --scan --pattern 'am:rl:{apiKeyId}:*'
redis-cli GET 'am:rl:{apiKeyId}:{bucket}'
```

Compare against the key's plan: `GET /api/apis/{apiId}/keys/{keyId}` shows the plan, which carries
`rateLimit` and `ratePeriod`.

**Resolution.** Raise the plan's limit (`PUT /api/apis/{apiId}/plans/{planId}`) — this evicts the
validation cache, so the new quota applies on the next request — or move the customer to a higher tier
via `PUT /api/apis/{apiId}/subscriptions/{subscriptionId}`.

### Symptom: Redis is down

Behaviour depends on `RATE_LIMIT_FAIL_OPEN`:

- **`true`** (free tiers): requests are permitted, logged at `WARN`. Availability is preferred over
  enforcement; expect quota over-spend for the outage duration.
- **`false`** (paid tiers): requests are rejected with 429. Enforcement holds, but the gateway is
  effectively down for customers.

Recovery is restoring Redis. Fixed-window counters are not durable in a cache-only configuration, so
a restart resets in-flight windows — harmless, since it can only grant extra quota within the current
window.

---

## 5. Background jobs (JobRunr)

Dashboard: `http://<host>:8000/dashboard` (**set `JOBRUNR_DASHBOARD_ENABLED=false` in production** —
there is no `prod` profile file doing this for you; reach it by temporarily enabling it on an
internal-only port, or inspect Redis directly).

### Jobs that should be running

| Job | Schedule | Purpose |
|-----|----------|---------|
| `Persist usage log` | per request | Writes gateway telemetry asynchronously |
| `Sweep expired API keys` | hourly, `0 5 * * * *` | Flips stale keys to `EXPIRED` |
| `Sweep expired subscriptions` | hourly, `0 15 * * * *` | Expires subscriptions, releases keys |
| `Reconcile all API ratings` | nightly, `0 45 3 * * *` | Repairs rating-aggregate drift |
| `Prune usage logs` | nightly, `0 30 3 * * *` | Applies the retention window |

### Symptom: jobs are queued but never processed

```bash
grep JOBRUNR_SERVER_ENABLED .env    # must be true
redis-cli --scan --pattern 'jobrunr:*' | head
```

Common causes:

1. **`JOBRUNR_SERVER_ENABLED=false`** on every instance — nothing consumes the queue.
2. **Redis eviction.** With an `allkeys-lru` policy, job records are evicted under memory pressure.
   The compose file sets `noeviction` deliberately; a managed Redis must be configured the same way.
3. **Worker starvation.** Increase `jobrunr.background-job-server.worker-count` if a backlog grows
   while the worker is otherwise healthy.

### Symptom: a specific job keeps failing and retrying

JobRunr retries with exponential backoff (3 attempts by default). Check the dashboard for the
exception, fix the cause, then delete the failed job so it stops retrying.

Both sweeps are idempotent — they select rows matching `status = ACTIVE AND expiresAt < now` — so
re-running them manually is safe.

---

## 6. Database

### Backup

```bash
docker compose exec db pg_dump -U postgres -Fc api_marketplace > backup-$(date +%F).dump
```

### Restore

```bash
docker compose stop backend
docker compose exec -T db pg_restore -U postgres -d api_marketplace --clean --if-exists < backup.dump
docker compose start backend
```

### Failover

Point `DB_URL` at the new primary and restart the backend. HikariCP discards pooled connections on
restart, so no application-side drain is required. Existing connections to a failed primary are
detected via `connectionTimeout` (30s default), which bounds the error window.

### Symptom: `LazyInitializationException` in logs

`spring.jpa.open-in-view=false` is deliberate, so a service must dereference associations inside its
transaction before mapping to a DTO. This error means a mapping lambda is being evaluated after the
transaction closed. Fix by mapping inside the service method (the `mapToResponse` convention), not at
the controller or in a stream returned lazily.

---

## 7. Gateway

### Symptom: `400 The upstream API could not be reached`

The gateway could not complete the outbound request. Check, in order:

1. Is the provider's `baseUrl` correct and publicly routable? `curl -I <baseUrl>`
2. Is the host blocked by `GATEWAY_ALLOWED_HOSTS`? A blocked host returns
   `400 Upstream host is not on the gateway allow-list`, which distinguishes it from a transport error.
3. Is the upstream slower than `GATEWAY_READ_TIMEOUT_MS` (30s default)? Raise it if the API is
   genuinely slow, rather than leaving customers to see timeouts.

### Symptom: SSRF attempts appear in logs

```
WARN  Blocked SSRF attempt: internal.example.com resolved to non-routable 10.0.0.5
```

A provider configured a `baseUrl` resolving to a private address. The request was refused. Identify
the owning API and contact the provider:

```sql
SELECT id, name, owner_id, base_url FROM apis WHERE base_url LIKE '%internal.example.com%';
```

Consider whether `GATEWAY_ALLOWED_HOSTS` should be locked down further.

### Response bodies are being truncated

The upstream response exceeded `GATEWAY_MAX_RESPONSE_BYTES` (1 MiB default). The caller sees
`"truncated": true`. Raise the limit only deliberately — it is a memory and egress control.

### Symptom: the API console shows garbled characters instead of readable content

The body renders as mojibake, typically beginning with `�` (the gzip magic bytes `1F 8B` read as
text). The upstream returned a **content-encoded** body that reached the caller undecompressed.

The gateway requests `Accept-Encoding: identity` and strips the header inbound, so this should not
occur. If it does:

1. Check the upstream response headers with `curl -I -H 'Accept-Encoding: identity' <baseUrl>`. A
   server that compresses unconditionally is violating the request; the gateway will decompress
   `gzip`/`deflate` as a fallback.
2. Look for these log lines, which mean the fallback could not help:
   - `Could not decode '<encoding>' upstream body` — the payload was malformed.
   - `Unsupported upstream Content-Encoding '<encoding>'` — `br` (Brotli) or `zstd` is in use. These
     need an explicit decoder; the body is forwarded as received rather than silently mangled.

Note also that `GatewayResponse.body` is a `String`, so **binary** upstream responses (images, PDFs,
protobuf) cannot be relayed faithfully — they are decoded as UTF-8 text. If a provider needs to serve
binary content, that is a product limitation to raise rather than a configuration problem.

---

## 8. Common incidents

### All users signed out at once

`JWT_SECRET` changed, or a backend restarted with a different secret. Confirm the value is identical
across every instance. This is expected and intended after a rotation.

### A provider cannot publish

`POST /api/apis` requires `ROLE_PROVIDER`:

```sql
SELECT id, email, role FROM users WHERE email = 'provider@example.com';
```

### A developer cannot subscribe — `409 No API keys are currently available`

The provider's pool is empty. Only the provider can fix it:

```
POST /api/apis/{apiId}/keys    # provider JWT
```

Consider alerting providers when their pooled-key count reaches zero, since the failure surfaces to
*their* customers.

### Cohort of users seeing stale catalog data

Cache TTLs are short by design (60s catalog, 5min categories), so staleness beyond a minute implies a
missed eviction rather than TTL lag. Every write path evicts its cache; if a new write path was added
without an `@CacheEvict`, that is the bug. The cache is non-fatal — `redis-cli FLUSHDB` clears
everything and the application repopulates from the database.

### Draft or private API visible to an anonymous caller

This should be impossible, and the invariant is enforced structurally:

- Only **publicly visible** APIs are ever written to the `apiCatalog` cache. `PublicApiCacheReader`
  re-checks `Api.isPubliclyVisible()` on every populate and refuses to cache anything else.
- `ApiService.getApi` / `getApiBySlug` evaluate `canView(...)` against the *current principal* and
  only delegate to the cache for public records; non-public reads bypass the cache entirely.

If a draft leaks, the cause is a new code path that caches an `ApiResponse` without that guard — the
cache key (`id:{id}` / `slug:{slug}`) carries no principal dimension, so any cached non-public record
is readable by everyone. Confirm with:

```bash
redis-cli --scan --pattern 'am:cache:v3:apiCatalog:*'
```

and compare each entry's `status`/`visibility` against expectations. `redis-cli FLUSHDB` clears the
exposure immediately; fix the offending write path before redeploying.

---

## 9. Health and observability

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

