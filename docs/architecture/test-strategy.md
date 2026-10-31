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
| Contract | Redocly lint; `test_contract.py`; every response of every backend test checked (`tests/contract.py`) | `api/`, `backend/tests/` | The server implements `api/openapi.yaml`: its routes are contract operations (path, method, operationId, success status), operations it does not serve say why (`x-not-implemented`), and every answer the tests receive has a documented status and matches its schema |
| End to end | Playwright | `e2e/` | The app on the throw-away stack in Chromium: signing in and out, an event through the trash and back, a note, a board with a card; the legacy regression suite, one scenario per F-xx (`e2e/tests/legacy/`, HAAL-141); every test fails on a console error or warning, an uncaught exception or an unexpected API answer ≥ 400; the offline and sync scenarios on the production build, concurrent edits and conflicts included (`e2e/tests/offline/`, HAAL-142) |
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
| Contract | Every route in the contract, every unserved operation explained, every response the tests receive valid | `pnpm backend:check` (part of pytest) |
| End to end | All scenarios pass with a clean console | `pnpm e2e` / `scripts/dev/check-all.sh --e2e` (TypeScript and Prettier of `e2e/` always) |
| Dependencies | No known vulnerability without a listed, unexpired exception | `pnpm security:audit`, `test_audit_ignores.py` |

Coverage counts the project's own code: the generated API client, the route tree, tests and type-only files are left
out. Floors are raised as tests grow and are never lowered without the owner's decision. Coverage reports are written
to `backend/.coverage` / `htmlcov` and `frontend/coverage/` (git-ignored).

## 5. Contract conformance

ADR-0007 named Schemathesis for property-based contract tests. It depends on Hypothesis (MPL-2.0), which is outside
the allowed licences, so the backend checks conformance itself (no new dependency; `jsonschema` and `referencing`,
MIT):

- `backend/tests/contract.py` reads `api/openapi.yaml` and its module files as they are and validates JSON bodies
  against the response schemas (JSON Schema 2020-12, as OpenAPI 3.1); `conftest.contract_responses` runs it on every
  response of every test, so the 580-odd API tests are the examples. A test that calls routes outside the contract on
  purpose (error handlers, security guards on test routes) is marked `no_contract`.
- `backend/tests/test_contract.py` compares the app's routes with the contract both ways.
- A breaking change of a shape therefore fails the tests that use it, with the operation, status and JSON path.

## 6. End-to-end tests

- `pnpm e2e` runs `e2e/` with Playwright (Chromium, Europe/Berlin, en-US, one worker): without `E2E_BASE_URL` it
  starts the throw-away stack and stops it afterwards; the global setup creates the first administrator through the
  setup wizard (or signs in, `E2E_ADMIN_*`) and keeps the session for the scenarios.
- `e2e/fixtures.ts`: the `watch` fixture fails a test on console errors and warnings, uncaught exceptions and API
  answers ≥ 400 unless the test allows them (`watch.allow(...)`); `unique(title)` keeps titles apart within a run.
- `e2e/tests/legacy/`: the legacy regression suite (HAAL-141), one scenario per feature of
  `docs/requirements/legacy-feature-inventory.md`, named `F-xx …` (`pnpm --filter haalendar-e2e exec playwright test -g F-14` runs one); a feature not built
  yet is a `test.fixme` naming its task. Scenarios that depend on "today" fix the browser clock (`fixToday`), and every
  scenario works on its own day with unique titles, so they pass against a stack that already has data.
- `e2e/tests/offline/` (project `offline`, HAAL-142): offline and sync on the production build with its service
  worker (`stack-up.sh --preview`, port 4173, same API; `E2E_OFFLINE_URL` for another stack): the network cut and
  back, a reload without network, a server answering 503, a change applied once although its answer was lost, two
  tabs of one device, signing out with unsent changes; and edits on two devices at the same time (`conflicts.spec.ts`):
  different fields merged, the same field kept for a choice per field in Settings → Sync, an event changed here but
  deleted on the other device restored with the changes or let go, a delete of something changed elsewhere told and
  pointing to the trash. A second browser context is another device (its own local database). A scenario waits until
  the outbox is empty (`allSent`) before it cuts the network, so the counts it expects are its own.
- Scenarios use roles and accessible names as the user perceives them, never CSS classes or test ids; a failed run
  keeps a trace and a screenshot in `e2e/test-results/` (`pnpm --filter haalendar-e2e exec playwright show-trace …`).

## 7. Rules for every task

1. A change comes with tests at the levels of §2 that see it: a server rule → unit or API test; a screen → component
   test; a rule in both languages → an atom with shared vectors.
2. A bug fix starts with a test that fails without the fix.
3. Security rules (row-level security, soft delete, audit, permissions) are tested from the outside: as another user,
   through the API, against the real database.
4. `check-all.sh` green, then the live check, then the report (owner working rules).
5. Tests describe behaviour in their names ("an invited user must change the password first"), not implementation.

## 8. Related tasks

HAAL-141 legacy regression (E2E per F-xx), HAAL-142 offline and sync, HAAL-143 accessibility and performance, HAAL-144
security testing, HAAL-151 CI (the same commands as `check-all.sh`).
