# PulseStream Query Service

Read API over the telemetry the processor has persisted. It owns no data: the schema belongs to
`infrastructure/docker/postgres/init.sql` and the rows belong to `telemetry-processor`, so every
mapping here is read-only and Hibernate runs with `ddl-auto: none`.

Runs on `:8083`. Actuator exposes `health`, `info` and `prometheus`, with the Kubernetes probe groups
mirrored to `/livez` and `/readyz`.

---

## Endpoints

### `GET /api/v1/telemetry`

Paged slice of `platform.processed_telemetry`.

| Parameter | Default | Notes |
| :--- | :--- | :--- |
| `tenantId`, `deviceId`, `metric`, `eventType` | — | Exact match; omit for no restriction. |
| `from`, `to` | — | ISO-8601 instants, inclusive on both bounds. |
| `page`, `size` | `0`, `50` | `size` is capped at `pulsestream.query.max-page-size`. |
| `sort` | `timestamp` | One of `timestamp`, `ingestedAt`, `value`, `deviceId`, `metric`, `tenantId`, `eventType`. |
| `direction` | `desc` | `asc` or `desc`. |

```json
{
  "content": [ { "eventId": "...", "deviceId": "device-1", "metric": "temperature", "value": 21.5, "unit": "C", "timestamp": "2026-09-08T10:15:30Z" } ],
  "page": 0, "size": 50, "totalElements": 1, "totalPages": 1, "hasNext": false
}
```

### `GET /api/v1/telemetry/series`

Value series for one device/metric pair, ordered oldest to newest so a chart can plot it directly.
`deviceId` and `metric` are required; `tenantId`, `from`, `to` and `limit` are optional. The window is
read newest-first, so when it holds more points than `pulsestream.query.max-series-points` the newest
slice is returned and `truncated` is `true`.

### `GET /api/v1/anomalies`

Same shape as the telemetry search over `platform.anomalies`, with `severity` and `anomalyType`
filters. Both are matched case-insensitively because the column is free-form text. Sortable on
`timestamp`, `ingestedAt`, `value`, `threshold`, `deviceId`, `metric`, `severity`, `anomalyType`.

> Persisting anomalies from the processor is still an open Phase 3 gap, so this endpoint can return
> an empty page on a pipeline that is otherwise healthy and publishing to
> `telemetry.events.anomalies`.

### `GET /api/v1/facets`

Distinct values available for filtering: tenants, devices, metrics, event types, anomaly severities
and anomaly types. Everything except the tenant list is scoped by the optional `tenantId`, so a UI can
still offer a tenant switch while a tenant filter is applied.

### `GET /api/v1/summary`

Headline counters for the optional `tenantId`: processed events, anomalies, distinct devices, and the
newest event timestamp (`null` when there is nothing stored).

### `GET /api/v1/activity`

Readings per hour over a window, oldest first, defaulting to the last 24 hours. Hours with no
readings are returned explicitly with a count of zero, so a consumer draws a quiet period as a gap
instead of joining across it. The window is rejected if inverted or wider than 31 days.

```json
[{"start":"2026-09-08T09:00:00Z","count":128},{"start":"2026-09-08T10:00:00Z","count":0}]
```

### `GET /api/v1/devices`

One row per device carrying its most recent reading and its total reading count, most recently active
first. `limit` defaults to 12 and is capped at 100.

```json
[{"deviceId":"device-18","deviceType":"sensor","location":"lab-1","metric":"temperature",
  "lastValue":13.5000,"unit":"C","lastSeen":"2026-09-07T01:09:22Z","readings":106}]
```

Both of these are native queries — they need `date_trunc` and a window function — written in the SQL
subset Postgres and H2's PostgreSQL mode agree on, so the tests exercise the same statements that run
against Postgres.

---

### `GET /api/v1/platform/config`

Runtime settings the console reads instead of hardcoding: the deployment label, the stale-after window
(quiet devices, incident grouping), refresh intervals, `maxPageSize`, Kafka topic names, the
ingestion-service producer and telemetry-processor consumer settings, and the anomaly detection rules
with the severity order. Durations are whole milliseconds.

The Kafka and detection values belong to the other services. `pulsestream.platform.*` binds them from
the same environment variables and defaults those services use (for example
`PULSESTREAM_KAFKA_TOPIC_RAW`, `PULSESTREAM_DETECTION_MAX_TEMPERATURE`), so set an override for every
service, not only the owning one.

## Console sign-in

The web console requires an operator account. query-service owns three tables for it, created by
`infrastructure/docker/postgres/init.sql`: `platform.operators`, `platform.operator_sessions` and
`platform.operator_avatars`.

| Route | Auth | Purpose |
| :--- | :--- | :--- |
| `POST /api/v1/auth/register` | — | Create an account (`username`, `password`, `displayName`, optional `email`); returns a session, `201` |
| `POST /api/v1/auth/login` | — | Returns `{ token, expiresAt, operator }` |
| `POST /api/v1/auth/logout` | Bearer | Revokes the token, `204` |
| `GET /api/v1/auth/me` | Bearer | The signed-in operator |
| `PUT /api/v1/auth/me` | Bearer | Update `displayName` and `email` |
| `PUT /api/v1/auth/me/password` | Bearer | `currentPassword`, `newPassword`, `204` |
| `PUT /api/v1/auth/me/avatar` | Bearer | Multipart `file`: PNG, JPEG or WebP, checked by its bytes, at most 1 MB |
| `GET /api/v1/auth/me/avatar` | Bearer | The photo, `404` when there is none; sent `no-store` |
| `DELETE /api/v1/auth/me/avatar` | Bearer | Removes the photo |

Passwords are hashed with BCrypt. A session token is 32 random bytes returned once; only its SHA-256 is
stored, and logging out deletes it, so a token can be revoked at once.

**Every other `/api/v1` route requires `Authorization: Bearer <token>`** and answers `401` without a
valid session (`ApiAuthenticationInterceptor`). Only `/api/v1/auth/**` is reachable signed out, and
CORS preflights pass. Actuator (`/actuator/**`, `/livez`, `/readyz`) is outside `/api` and stays open
for probes and Prometheus. The simulator writes through ingestion-service and is not affected.

## Incidents and quarantine

telemetry-processor stores every flagged reading in `platform.anomalies` and correlates it into an
incident in `platform.incidents`: same tenant and device, no more than
`pulsestream.incidents.correlation-window` (15 min) after the incident's previous anomaly. A partial
unique index keeps one active incident per device across processor replicas. This service owns the
operator side.

| Route | Purpose |
| :--- | :--- |
| `GET /api/v1/incidents` | Paged, newest activity first. Filters `tenantId`, `deviceId`, `severity`, `status` (`OPEN`, `ACKNOWLEDGED`, `RESOLVED`, or `ACTIVE` = not resolved) |
| `GET /api/v1/incidents/{id}` | The incident and its readings, oldest first (at most 500) |
| `POST /api/v1/incidents/{id}/acknowledge` | `OPEN → ACKNOWLEDGED`, records the operator; `409` otherwise |
| `POST /api/v1/incidents/{id}/resolve` | Body `{ "note": "..." }` (required); `409` when already resolved |
| `GET /api/v1/quarantine` | Quarantined devices, with `suppressedEvents` |
| `PUT /api/v1/devices/{deviceId}/quarantine` | Body `{ "reason", "incidentId"? }`, optional `?tenantId=`; `201`, `409` if already quarantined, `404` for a device that never reported |
| `DELETE /api/v1/devices/{deviceId}/quarantine` | Releases the device and returns the entry with its final `suppressedEvents` |

While a device is quarantined, telemetry-processor drops its readings before detection — nothing is
stored, flagged or correlated — and counts them in `suppressed_events` and the
`pulsestream_quarantine_suppressed_events_total` metric. It re-reads the quarantine list every
`pulsestream.incidents.quarantine-refresh` (5 s). Every transition is logged with the operator's
username; the incident row keeps who acknowledged and resolved it, and the `version` column makes a
triage action that races a new anomaly fail with `409` instead of overwriting it.

A database created before these tables existed does not re-run `init.sql` on its own. The script is
idempotent (`IF NOT EXISTS` throughout), so apply it again:

```bash
docker exec -i pulsestream-postgres psql -U pulsestream -d pulsestream < infrastructure/docker/postgres/init.sql
```

---

## Errors

Failures use the platform `ErrorResponse` body shared with `ingestion-service`.

| Situation | Status |
| :--- | :--- |
| Malformed instant, missing required parameter, unsupported sort field or direction, inverted time window, invalid request body, photo that is not an image | `400` |
| Missing, expired or revoked session; wrong username or password | `401` |
| Registration disabled | `403` |
| Username already taken | `409` |
| Photo larger than the limit | `413` |
| Telemetry store unreachable or failing | `503` |
| Anything else | `500` |

---

## Configuration

| Property | Environment variable | Default |
| :--- | :--- | :--- |
| `spring.datasource.url` | `PULSESTREAM_POSTGRES_URL` | `jdbc:postgresql://localhost:5432/pulsestream` |
| `spring.datasource.username` | `PULSESTREAM_POSTGRES_USERNAME` | `pulsestream` |
| `spring.datasource.password` | `PULSESTREAM_POSTGRES_PASSWORD` | `pulsestream` |
| `pulsestream.query.max-page-size` | `PULSESTREAM_QUERY_MAX_PAGE_SIZE` | `500` |
| `pulsestream.query.max-series-points` | `PULSESTREAM_QUERY_MAX_SERIES_POINTS` | `2000` |
| `pulsestream.query.cors-allowed-origins` | `PULSESTREAM_QUERY_CORS_ALLOWED_ORIGINS` | the web UI dev server and container origins |
| `pulsestream.auth.session-ttl` | `PULSESTREAM_AUTH_SESSION_TTL` | `12h` |
| `pulsestream.auth.registration-enabled` | `PULSESTREAM_AUTH_REGISTRATION_ENABLED` | `true` |
| `pulsestream.auth.max-avatar-bytes` | `PULSESTREAM_AUTH_MAX_AVATAR_BYTES` | `1048576` |

---

## Running and testing

```bash
./mvnw spring-boot:run   # needs Postgres from infrastructure/docker
./mvnw test              # H2 in PostgreSQL mode, no external database required
```
