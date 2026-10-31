# Test strategy

+++===+++ 2026-10-30 — Hasan Alizada — HAAL-140. What each level of tests checks, where the tests live, how they get their
data and which gates a change must pass (SRS 4.7, D-20; ADR-0003 test stack, ADR-0007 contract, ADR-0009 sync).

## 1. Goals

- Every feature is covered by automated tests at the lowest level that can see the behaviour, and once more at the
  level where its parts meet (API for the server, component for the web app, E2E for the whole path).
- Tests are deterministic: they do not depend on the day, the time zone of the machine, the network or the order they
  run in. A flaky test is a bug and is fixed in the session it shows up in, never retried away.
- One command answers "may this be committed": `scripts/dev/check-all.sh` (exit code 0 only when every step passes).

## 2. Levels

| Level | Tool | Where | What it checks |
|---|---|---|---|
| Static | Ruff, mypy (strict); TypeScript (`tsc -b`), ESLint, Prettier; Redocly lint | `backend/`, `frontend/`, `api/` | Style, types, contract shape |
| Unit | pytest; Vitest | `backend/tests/test_*.py`; `frontend/src/**/*.test.ts` | Pure rules: form models, recurrence, sync merge, permissions atom, palette, parsing |
| Atoms | pytest + Vitest over shared vectors | `atoms/` (vectors), `test_*_atom.py`, `src/atoms/**/*.test.ts` | A rule implemented in Python and TypeScript gives the same result for every vector (ADR-0006) |
| Backend integration | pytest + FastAPI `TestClient` on PostgreSQL 18 (marker `db`) | `backend/tests/` | Endpoints and sync end to end on a real database as the least-privilege app role: row-level security, soft delete, audit triggers, versions, notifications, jobs |
| Frontend component | Vitest + jsdom + Testing Library, fake API (`src/test/fake-api.tsx`), fresh IndexedDB per test | `frontend/src/test/*.test.tsx` | Screens as a user drives them: roles and names, keyboard, local database and outbox, undo, offline queue |
| Contract | Redocly lint; spec comparison; Schemathesis | `api/`, `backend/tests/` | The server implements `api/openapi.yaml`: the same operations and responses, answers valid against the schemas (stage 2 of HAAL-140) |
| End to end | Playwright | `e2e/` | The built app against a real stack in Chromium: the main paths of each module, a clean browser console (stage 2 of HAAL-140; legacy scenarios F-01..F-34 HAAL-141, offline HAAL-142) |
| Live check | Playwright scripts on the throw-away stack | session scratch space | After each task: the changed screens on desktop, tablet and phone widths, console and API errors (owner working rules) |
| Security | `pnpm audit`, pip-audit with expiring exceptions; isolation tests | root `security:audit`, `test_isolation.py`, `test_audit_ignores.py` | Known vulnerabilities, data of one user never reaching another (more: HAAL-144) |

Layout-dependent behaviour (drag and drop positions, scrolling, sizes) is not visible in jsdom: it is checked in E2E or
the live check, and the logic around it is factored into pure functions with unit tests.

## 3. Test data and isolation

- **Backend:** each test session creates a throw-away database on the server named by `HAALENDAR_TEST_DATABASE_URL`,
  migrates it, and connects the app as the application role (as in production); fixtures that clean up use the owner
  role. Users and content are created through the API or the service functions, never by inserting rows past the
  rules. Elapsed time is simulated with `sql_maintenance(...)`, never with sleeps. Settings come from an explicit
  environment, never from the developer's `.env`.
- **Frontend:** the fake API answers with data built from the generated types; every test gets an empty IndexedDB;
  dates are fixed with fake timers where "today" matters, and assertions never depend on the date the test runs.
- **E2E:** the throw-away stack (`scripts/dev/stack-up.sh`) starts empty; tests create the first administrator and
  invite their users through the API (an invited user changes the one-time password first). One browser context per
  user, so CSRF tokens never mix.
- Nothing a test writes outlives it: databases, stacks and uploads are dropped at the end.

## 4. Gates

| Gate | Rule | Enforced by |
|---|---|---|
| Backend line coverage | ≥ 80 % of `src/haalendar` (D-20) | `pnpm backend:check` (`pytest --cov`, `[tool.coverage.report] fail_under` in `backend/pyproject.toml`) |
| Frontend coverage | Floors just under the level when the gate came: lines 90 %, statements 88 %, functions 85 %, branches 80 % | `pnpm check` (`vitest run --coverage`, `test.coverage.thresholds` in `frontend/vite.config.ts`) |
| All tests pass, database tests included | Without a database the backend coverage falls far below 80 %, so skipped database tests fail the gate | `scripts/dev/check-all.sh` (starts PostgreSQL itself) |
| Contract, E2E | Stage 2 of HAAL-140 | `check-all.sh` |
| Dependencies | No known vulnerability without a listed, unexpired exception | `pnpm security:audit`, `test_audit_ignores.py` |

Coverage counts the project's own code: the generated API client, the route tree, tests and type-only files are left
out. Floors are raised as tests grow and are never lowered without the owner's decision. Coverage reports are written
to `backend/.coverage` / `htmlcov` and `frontend/coverage/` (git-ignored).

## 5. Rules for every task

1. A change comes with tests at the levels of §2 that see it: a server rule → unit or API test; a screen → component
   test; a rule in both languages → an atom with shared vectors.
2. A bug fix starts with a test that fails without the fix.
3. Security rules (row-level security, soft delete, audit, permissions) are tested from the outside: as another user,
   through the API, against the real database.
4. `check-all.sh` green, then the live check, then the report (owner working rules).
5. Tests describe behaviour in their names ("an invited user must change the password first"), not implementation.

## 6. Related tasks

HAAL-141 legacy regression (E2E per F-xx), HAAL-142 offline and sync, HAAL-143 accessibility and performance, HAAL-144
security testing, HAAL-151 CI (the same commands as `check-all.sh`).
