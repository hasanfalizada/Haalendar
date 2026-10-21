# ADR-0003: Technology stack

+++===+++ 2026-10-14 — Hasan Alizada — HAAL-010. Accepted by owner 2026-10-14 including all three deviations from the instruction baseline (Section V.7).

| Field | Value |
|---|---|
| Status | Accepted |
| Date | 2026-10-14 |
| Decider | Hasan Alizada (owner) |
| Versions verified | 2026-10-14 against npm registry, PyPI, postgresql.org, endoflife.date |

## 1. Context
Drivers from SRS v1.1 that shape the stack:
- **Offline-first PWA** (FR-OFF-01..06): the client must boot and work with no server; data lives in the browser (IndexedDB) and syncs later.
- **Multi-user, on-prem** (FR-ACC-*, 2.4): simple Docker Compose install on 2 vCPU / 2 GB RAM, x86_64 + arm64; as few services as possible.
- **Full-text search** (FR-X-10), **recurrence RRULE** (FR-CAL-10/30), **audit + soft delete** (FR-X-01/03), **push updates** (FR-X-18), **reminders with Web Push** (FR-CAL-29).
- **LLM-native atomic architecture**, contract-first (JSON Schema + OpenAPI), Project Manifest.
- Priority order: Security > UX > Maintainability > Simplicity > Brevity > Performance.

Baseline to validate (instructions V.7): FastAPI + Pydantic, PostgreSQL, Next.js + Tailwind + shadcn, Pytest, Pants, Prisma/SQLModel, JSON Schema + OpenAPI, BLAKE3, MCP.

## 2. Evaluation of the baseline
| Baseline item | Verdict | Reason |
|---|---|---|
| Python + FastAPI + Pydantic | **Keep** | Mature, async, generates OpenAPI 3.1 from Pydantic models = contract-first fit |
| PostgreSQL | **Keep** | ACID, built-in FTS (tsvector), JSONB for audit snapshots, row-level security for isolation (defense in depth), logical replication keeps every offline-sync option open (HAAL-050) |
| Pytest | **Keep** | Standard |
| Tailwind + shadcn/ui | **Keep** | shadcn supports Tailwind v4 and works with Vite and Next.js alike |
| JSON Schema + OpenAPI, BLAKE3, MCP | **Keep** | Architecture-level, stack-neutral |
| **Next.js** | **Replace → React + Vite SPA** | See 3.1 |
| **Pants** | **Replace → uv + pnpm workspaces** | See 3.2 |
| **Prisma / SQLModel** | **Replace → SQLAlchemy 2.1 + Alembic** | See 3.3 |

## 3. Deviations
### 3.1 Next.js → React + Vite SPA (static PWA)
| Criterion | Next.js 16.4 (App Router, RSC, Cache Components) | React 19 + Vite 8 SPA |
|---|---|---|
| Offline boot and navigation | RSC navigation fetches payloads from the Node server; offline needs workarounds or `output: export`, which drops most Next.js value | Native: app shell cached by service worker, routing fully client-side |
| On-prem services | Extra Node.js server container next to Python | Static files only (served by the web server) |
| Resource use (2 GB RAM target) | Node server ~150-300 MB extra | None |
| SEO / SSR | Strong — not needed (app behind login) | Not needed |
| Fit with local-first data (IndexedDB is the source of truth for UI) | Server-first model works against it | Direct |
Decision: **React + Vite SPA** with TanStack Router (type-safe routing) and TanStack Query (server state); local store chosen in HAAL-050.

### 3.2 Pants → uv + pnpm workspaces
- Pants JavaScript backend is still experimental/beta (Pants 2.32 docs); uv lockfiles in Pants are experimental.
- Contributors to an open-source project should need only standard tools.
- **uv** (Python versions, venvs, lockfile, workspaces) + **pnpm** (JS workspaces) + root `package.json` scripts as the single task entry point (Node is required for the frontend anyway). No extra build system.

### 3.3 Prisma / SQLModel → SQLAlchemy 2.1 + Alembic
- Prisma is a Node.js ORM — not applicable to a Python backend.
- SQLModel is still 0.0.x and merges API and DB models; contract-first atoms need API contracts (Pydantic) separate from persistence models.
- SQLAlchemy 2.1 (typed, async) + Alembic migrations are the mature standard.

## 4. Decision — stack and versions
| Layer | Choice | Version (latest stable 2026-10-14) | Note |
|---|---|---|---|
| Backend language | Python | **3.14** (3.14.8) | 3.15.0 released 2026-10-09 — too fresh for wheel coverage; move in v1.x |
| Web framework | FastAPI | 0.143.x | Pin exact version (0.x may break between minors) |
| Validation / contracts | Pydantic | 2.14.x | JSON Schema export for atom contracts |
| ASGI server | Uvicorn | 0.54.x | |
| ORM / migrations | SQLAlchemy / Alembic | 2.1.x / 1.20.x | Async engine |
| DB driver | psycopg | 3.3.x | Async |
| Database | PostgreSQL | **18** (18.6) | 19 is in beta (beta 4, 2026-09-24); upgrade after GA |
| Password hashing | argon2-cffi | 25.1.x | Argon2id (ASVS L2) |
| Background jobs | Procrastinate (PostgreSQL-based queue) | 3.10.x | Reminders, e-mail, demo reset — no Redis needed; final in HAAL-011 |
| Web Push | pywebpush | 2.5.x | VAPID, self-hosted |
| Push updates | SSE (sse-starlette) | 3.5.x | Final in HAAL-055 |
| Python tooling | uv / Ruff / mypy | 0.13.x / 0.17.x / 2.4.x | |
| Backend tests | Pytest | 9.1.x | |
| Frontend runtime | Node.js | **24 LTS** for tooling | 26 becomes LTS 2026-10-28 — switch then |
| Package manager | pnpm | 12.x | |
| UI library | React | 19.3.x | |
| Language | TypeScript | **6.0.x** | 7.0 exists, but typescript-eslint 8.71 supports `<6.1` only |
| Build tool | Vite | 8.3.x | |
| Routing / server state | TanStack Router / TanStack Query | 1.170.x / 5.104.x | |
| Styling / components | Tailwind CSS / shadcn/ui | 4.3.x / CLI 4.21.x | Brand tokens from ADR/brand guidelines |
| PWA | vite-plugin-pwa (Workbox) | 2.0.x / 7.4.x | generateSW, app shell only, update on request (HAAL-051, D-55) |
| Local DB (browser) | Dexie | 4.4.x | Custom outbox + server pull/push, no sync service (ADR-0009, HAAL-050) |
| Lint / format (TS) | ESLint + typescript-eslint, Prettier | 10.x / 8.71.x | Alternative Biome 2.5 — decide in HAAL-017 |
| API client generation | @hey-api/openapi-ts | 0.99.x | From OpenAPI; final in HAAL-015 |
| Frontend unit tests | Vitest | 5.0.x | |
| E2E tests | Playwright | 1.64.x | |
| Containers | Docker, Docker Compose | — | Topology in HAAL-011 |

## 5. Consequences
- Deployment = 2 required services (app, PostgreSQL) + optional worker/proxy — fits 2 GB RAM.
- Frontend is static: served by the reverse proxy or by FastAPI; no Node.js in production.
- The hand-written OpenAPI contract (`api/openapi.yaml`) is the single source for the TS client; the FastAPI implementation is verified against it in CI (refined by ADR-0007).
- All versions are pinned in lockfiles (`uv.lock`, `pnpm-lock.yaml`); Renovate/Dependabot updates in HAAL-151.
- Re-check before v1.0: Python 3.15, PostgreSQL 19, Node 26 LTS, TypeScript 7 tooling support.
- All dependencies are Apache-2.0 compatible (MIT/BSD/Apache/PostgreSQL licence); licence gate in CI (ADR-0001).

## 6. Owner approval (2026-10-14)
1. Next.js → React + Vite SPA — approved.
2. Pants → uv + pnpm workspaces — approved.
3. Prisma/SQLModel → SQLAlchemy 2.1 + Alembic — approved.

## 8. Addendum — background jobs in place (HAAL-043, 2026-10-18)
+++===+++ 2026-10-18 — Hasan Alizada — HAAL-043 (D-48).

Procrastinate 3.10.0 is introduced with the data export: its schema is applied by migration 0011; tasks are defined per process (`haalendar.jobs.make_job_app`); the API defers jobs, a separate process `haalendar-worker` runs them (the same image, another command in deployment). Jobs connect as the application role, so row-level security applies. Finished jobs are kept; the library removes only rows of its worker registry, which is service data (the soft-delete rule protects user content and its metadata, see D-48).

## 7. Addendum — frontend tooling decisions (HAAL-017, 2026-10-14)
Open items from section 4 resolved while building the frontend shell:
| Item | Decision | Reason |
|---|---|---|
| Lint / format | ESLint 10 + typescript-eslint (strict, type-aware) + Prettier 3 | Default in section 4; Biome not needed |
| i18n | i18next + react-i18next, type-safe keys from `locales/en.json` | Most widespread React i18n stack, MIT |
| API client | @hey-api/openapi-ts (fetch client + SDK), generated on every dev/build/check, not committed | ADR-0007: contract is the source of truth |
| Routing | TanStack Router file routes with code splitting; `routeTree.gen.ts` committed so type-checking works without running Vite | Router plugin regenerates it |
| Fonts | Inter self-hosted via @fontsource-variable (no Google Fonts requests) | On-prem / offline / privacy |
| Supply chain | pnpm `minimumReleaseAge: 10080` (7 days), install scripts blocked by default, `@scarf/scarf` telemetry denied | Instructions Section K |
| Versions | All direct dependencies pinned to the newest release that is at least 7 days old (e.g. React 19.3.0, Vite 8.3.3, TypeScript 6.0.3, Tailwind 4.3.3, TanStack Router 1.170.41) | Policy above |
| Strictness | `strict`, `noUncheckedIndexedAccess`; `exactOptionalPropertyTypes` not used because generated client code is incompatible | Keep generated code untouched |
