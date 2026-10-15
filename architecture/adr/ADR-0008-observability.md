# ADR-0008: Observability — logs, correlation, metrics

+++===+++ 2026-10-15 — Hasan Alizada — HAAL-019. Accepted by owner 2026-10-15; recommended options chosen (section 5).

| Field | Value |
|---|---|
| Status | Accepted |
| Date | 2026-10-15 |
| Decider | Hasan Alizada (owner) |
| Depends on | ADR-0003, ADR-0004, ADR-0007 |

## Context
SRS 4.9 requires structured JSON logs with correlation IDs, a metrics endpoint and log redaction. Haalendar is on-premises: operators bring their own tooling (Docker logs, Loki/ELK, Prometheus/Grafana), and the product must not send telemetry anywhere by default.

## Decision
### Logs
- structlog JSON lines to stdout (collected by the container runtime; any log stack can ingest them). Fields: `timestamp` (UTC ISO 8601), `level`, `logger`, `event`, `request_id`, `method`, `path`, `route`, `status`, `duration_ms` plus event fields.
- Redaction processor removes values of keys containing password, secret, token, authorization, cookie, csrf, session, totp, recovery_code, database_url, api_key — also inside nested structures. Tests assert that emitted lines never contain such values.
- Slow SQL: statements above `HAALENDAR_DB_SLOW_QUERY_MS` (default 200 ms = p95 target) logged as `db_slow_query` with truncated SQL text only — bound parameters are never logged.

### Correlation
- `X-Request-ID` is accepted from the client when it matches `[A-Za-z0-9._-]{1,64}`, otherwise generated; returned in every response header, in RFC 9457 bodies (`request_id`) and in every log line of the request.
- The web app generates the id for every API call (generated client interceptor) and logs failed calls with it in the browser console — a user-reported error can be traced to the exact server log line.
- Worker jobs will carry the originating `request_id` (HAAL-091 and later).

### Metrics
- Prometheus text format via `prometheus-client` 0.26 (Apache-2.0) in a per-app registry.
- `haalendar_http_requests_total{method,route,status}`, `haalendar_http_request_duration_seconds{method,route}` (buckets around the 200/500 ms SLO), `haalendar_http_requests_in_progress`, `haalendar_db_pool_size|checked_out|overflow`, `haalendar_db_slow_queries_total`, `haalendar_build_info{version,env}`.
- `route` is the route **template** (`/api/v1/events/{id}`); unmatched requests use `unmatched` — no raw paths or user data in labels (bounded cardinality, no data leaks).
- Endpoint `GET /metrics` (outside the public API contract): disabled by default; when enabled it requires `Authorization: Bearer <HAALENDAR_METRICS_TOKEN>` (≥ 24 chars, constant-time comparison, `_FILE` secret supported).

### Not in v1.0
- Distributed tracing (OpenTelemetry) — single backend process plus worker does not need it yet.
- Error-tracking SaaS (e.g. Sentry) — conflicts with "no external telemetry by default".

## Consequences
- Operators can scrape metrics and ship logs without code changes; nothing leaves the instance unless they configure it.
- Verified: unit tests (8 backend, 2 frontend) and a live uvicorn smoke test (401 without token; metrics with correct labels; correlated JSON log line; token never logged).
- Compose integration (healthchecks, optional Prometheus/Grafana example) follows in HAAL-150.

## 5. Owner decisions (2026-10-15)
1. `/metrics` stays on the main port, disabled by default, bearer token required when enabled.
2. OpenTelemetry tracing deferred until after v1.0.
