<!-- +++===+++ 2026-10-14 — Hasan Alizada — HAAL-015. How to read, lint and mock the API contract. The contract is the source of truth; the backend must conform to it. -->

# Haalendar HTTP API contract

OpenAPI 3.1 description of the Haalendar API, written **contract-first**.

```
api/
  openapi.yaml            root: info, servers, security, path index
  components/common.yaml  base types, RFC 9457 problems, pagination, headers
  modules/*.yaml          one file per area: paths + module schemas
    accounts.yaml  admin.yaml  calendar.yaml  notes.yaml
    kanban.yaml    items.yaml  collab.yaml    sync.yaml
  redocly.yaml            lint configuration
```

## Conventions

| Topic | Rule |
|---|---|
| Base path | `/api/v1` (major version in the URL) |
| Format | JSON, `snake_case` field names |
| IDs | UUIDv7; clients may send their own `id` on create (offline creation, idempotent replay) |
| Errors | [RFC 9457](https://www.rfc-editor.org/rfc/rfc9457) `application/problem+json` with stable `code`, `errors[]` (JSON Pointer), `request_id` |
| Update | `PATCH` with `application/merge-patch+json` ([RFC 7396](https://www.rfc-editor.org/rfc/rfc7396)) and `If-Match: "<version>"` → `412` on conflict (body has `current`), `428` when missing |
| Delete | Always soft; returns `deleted_at` and `delete_batch_id`; restore via `/trash/restore` |
| Recurring events | `scope=this\|following\|all` + `occurrence_date` on `PATCH`/`DELETE /events/{id}` |
| Lists | Cursor pagination: `cursor`, `limit` (≤ 200), response `next_cursor` |
| Idempotency | Optional `Idempotency-Key` (UUID) on `POST`; kept 24 h |
| Auth | Session cookie `__Host-haalendar_session` + `X-CSRF-Token` on unsafe methods |
| Dates and times | RFC 3339 timestamps in UTC; events use local `start_date`/`start_time` + IANA `tzid` |
| Rate limits | `429` with `Retry-After` |

Endpoints tagged `sync` are **provisional** (`x-status: provisional`) until the offline-sync design is final.

## Lint

```bash
npx @redocly/cli@2.63.0 lint --config api/redocly.yaml
```

## Mock server

```bash
npx @stoplight/prism-cli@5.16.0 mock -d -p 4010 api/openapi.yaml
```

`-d` generates dynamic example data from the schemas. Requests are validated against the contract (missing parameters → 422, missing session cookie → 401). Requires Node.js ≥ 24.18.

## Bundle (single file, e.g. for client generation)

```bash
npx @redocly/cli@2.63.0 bundle api/openapi.yaml -o dist/openapi.yaml
```
