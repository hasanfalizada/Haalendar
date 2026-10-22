# ADR-0007: HTTP API design and contract-first workflow

+++===+++ 2026-10-14 — Hasan Alizada — HAAL-015. Accepted by owner 2026-10-14; all recommended options chosen (section 5).

| Field | Value |
|---|---|
| Status | Accepted |
| Date | 2026-10-14 |
| Decider | Hasan Alizada (owner) |
| Depends on | ADR-0003, ADR-0005, ADR-0006, domain model v1.0 |

## Context
Task HAAL-015 requires an OpenAPI contract for all modules with RFC 9457 errors, pagination, idempotency and a mock server, so that frontend work can start before the backend exists. Instructions require contract-first, chunked contracts readable by an LLM.

## Decision
### Contract
- Hand-written OpenAPI **3.1.1** in the code repository `api/`: root `openapi.yaml` (path index) + `components/common.yaml` + one module file per area (≤ ~600 lines each) — an agent loads only the module it works on. Registered in the Project Manifest as `api_contract`.
- Size of v1 contract: 116 operations across setup, auth, account, admin, calendar, to-do, kanban, generic item sub-resources, sharing, search, trash, export, notifications, bulk, sync (provisional), system.
- Lint: Redocly CLI 2.63 `recommended` ruleset; 6 intentional exceptions (public status/health endpoints without 4xx, OIDC redirects without 2xx) recorded in `.redocly.lint-ignore.yaml`. Result: valid, 0 errors.
- Mock: Prism 5.16 (`prism mock -d`) serves schema-generated data and validates requests (verified: 200 responses, 422 on missing parameters, 401 without session cookie).

### Conventions
| Topic | Decision |
|---|---|
| Versioning | `/api/v1`; breaking changes → `/api/v2` |
| Naming | `snake_case` JSON fields (same as atom contracts and DB), resource paths plural nouns, actions as sub-resources only where REST does not fit (`move-next-day`, `duplicate`, `convert`, `restore`) |
| IDs | UUIDv7, client-generated allowed; create with existing identical id → 200 (idempotent replay) |
| Errors | RFC 9457 with stable `code` enum, `errors[]` with JSON Pointer, `request_id`, `current` on version conflict; `type` = relative URI `/problems/{code}` served by each instance |
| Concurrency | `If-Match` with resource `version` as strong ETag; 412 / 428 |
| Partial update | `application/merge-patch+json` (RFC 7396) |
| Delete | Soft only; response carries `delete_batch_id`; restore via `/trash/restore` |
| Recurrence | `scope=this/following/all` + `occurrence_date` on PATCH/DELETE of events; responses list every created/updated entity (enables client undo) |
| Pagination | Opaque cursor, `limit` ≤ 200 |
| Idempotency | Optional `Idempotency-Key` header on POST, 24 h retention |
| Bulk | `/bulk`, all-or-nothing, one undo step |
| Auth | Session cookie + `X-CSRF-Token` (ADR-0005) |
| Real-time | SSE `/stream`; sync semantics fixed by ADR-0009 (HAAL-050), endpoints ready since HAAL-053 (pull/push) and HAAL-055 (`/stream`, D-59) <!-- +++===+++ 2026-10-22 — Hasan Alizada — HAAL-055. --> |

### Source of truth (refines ADR-0003)
ADR-0003 said "OpenAPI generated from Pydantic is the single source for the TS client". With contract-first, **the hand-written `api/openapi.yaml` is the source of truth**:
- TS client is generated from the bundled contract (@hey-api/openapi-ts).
- Backend Pydantic models implement it; CI checks conformance: (1) the FastAPI-generated spec is compared with the contract (no breaking differences, oasdiff), (2) property-based contract tests run against the running backend (Schemathesis).

## Consequences
- Frontend (HAAL-017 and later) can be built against the mock immediately.
- Every endpoint change starts with a contract PR; generated client and backend follow.
- ADR-0004 health check path aligned to `/api/v1/health/ready`.

## 5. Owner decisions (2026-10-14)
1. OpenAPI 3.1.1 (move to 3.2 when mock/lint/client tooling supports it).
2. `snake_case` JSON field names.
3. The hand-written contract `api/openapi.yaml` is the source of truth; backend conformance verified in CI (refines ADR-0003).
