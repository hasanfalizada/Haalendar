<!-- +++===+++ 2026-10-15 — Hasan Alizada — Developer runbook: set up, run and test Haalendar in every environment. Keep in sync with .env.example, package.json scripts and backend/pyproject.toml. -->

# Haalendar — Development Guide

How to set up, run and test Haalendar locally, and how the environments differ.

> **Status (rewrite in progress):** backend skeleton, API contract and frontend shell exist. Docker images, Compose files and the demo stand are not built yet (backlog HAAL-150, HAAL-154); production deployment is therefore not supported yet.

## Contents
1. [Prerequisites](#1-prerequisites)
2. [Repository layout](#2-repository-layout)
3. [First-time setup](#3-first-time-setup)
4. [Running the app](#4-running-the-app)
5. [Testing and checks](#5-testing-and-checks)
6. [Environments](#6-environments)
7. [Configuration reference](#7-configuration-reference)
8. [Troubleshooting](#8-troubleshooting)

---

## 1. Prerequisites

Supported development OS: **Linux or WSL 2** (Ubuntu 24.04 is tested). On Windows, run every command below **inside WSL**, not in PowerShell or Git Bash.

| Tool | Version | Install |
|---|---|---|
| Docker Engine | 29 or newer | [docs.docker.com/engine/install](https://docs.docker.com/engine/install/) (or Docker Desktop with WSL integration) |
| uv | 0.13 or newer | `curl -LsSf https://astral.sh/uv/install.sh \| sh` |
| Python | 3.14 | `uv python install 3.14` (uv manages it, no system Python needed) |
| Node.js | 24 LTS | `nvm install 24` ([nvm](https://github.com/nvm-sh/nvm)) |
| pnpm | 12 | `npm install -g pnpm@12` |
| git | any recent | `sudo apt install git` |

Check:

```bash
docker --version && uv --version && node --version && pnpm --version
```

**WSL note:** if Windows paths (`/mnt/c/...`) come before Linux paths in `PATH`, `node`/`npm` may resolve to the Windows installation. `which node` must print a path under `/home/...`.

## 2. Repository layout

| Path | Content |
|---|---|
| `api/` | HTTP API contract (OpenAPI 3.1) — the source of truth for backend and frontend |
| `atoms/` | Atom contracts and test vectors (see `atoms/README.md`) |
| `project.manifest.json` | Registry of atoms and the API contract |
| `backend/` | Python 3.14 / FastAPI / SQLAlchemy / Alembic |
| `frontend/` | React / Vite / TypeScript / Tailwind web app |
| `branding/` | Logos and icons |
| `docs/` | Development documentation: SRS and decision log, ADRs, domain model, design system, security baseline (see `docs/README.md`) |
| `.env.example` | All configuration variables with defaults |

## 3. First-time setup

From the repository root:

```bash
# 1. Python dependencies (creates .venv in the repo; see the tip below for a faster location)
uv sync --package haalendar-backend

# 2. JavaScript dependencies
pnpm install

# 3. Local configuration
cp .env.example .env
```

Edit `.env` if needed (defaults work for development).

**Tip (WSL with the repository on a Windows drive):** keep the Python virtual environment on the Linux file system for speed:

```bash
export UV_PROJECT_ENVIRONMENT="$HOME/.venvs/haalendar-backend"
```

Add the line to `~/.bashrc` to make it permanent.

### Database (PostgreSQL 18)

```bash
docker run -d --name haalendar-db \
  -e POSTGRES_USER=haalendar -e POSTGRES_PASSWORD=haalendar -e POSTGRES_DB=haalendar \
  -p 5432:5432 -v haalendar-db:/var/lib/postgresql postgres:18
```

The volume is mounted at `/var/lib/postgresql` (required since the PostgreSQL 18 image; the old `/var/lib/postgresql/data` path does not persist correctly).

Create the application role and apply migrations:

```bash
cd backend
set -a; source ../.env; set +a
uv run haalendar-db-bootstrap   # once: creates the role from HAALENDAR_DATABASE_URL (haalendar_app)
uv run alembic upgrade head     # every schema change; refreshes the role's table privileges
```

Two database roles are used, as in production: migrations run as the owner (`HAALENDAR_MIGRATION_DATABASE_URL`, the container's `haalendar` user), the app connects as `haalendar_app` — no superuser, no `BYPASSRLS`, and no `DELETE` privilege, so row-level security applies and rows can never be removed physically. If `/api/v1/health/ready` shows `"rls_enforced": false`, the app is connected as the owner; production refuses to start in that case.

## 4. Running the app

### Option A — full stack (backend + frontend)

Terminal 1 — API on `http://localhost:8080`:

```bash
cd backend
set -a; source ../.env; set +a
uv run haalendar-api
```

Terminal 3 (optional, needed for data exports) — background worker:

```bash
cd backend
set -a; source ../.env; set +a
uv run haalendar-worker
```

Terminal 2 — web app on `http://localhost:5173` (proxies `/api/v1` to port 8080):

```bash
pnpm dev
```

Useful URLs:

| URL | What |
|---|---|
| http://localhost:5173 | Web app |
| http://localhost:8080/api/v1/health/live | Liveness probe |
| http://localhost:8080/api/v1/health/ready | Readiness probe (200 = database reachable and migrations applied) |
| http://localhost:8080/api/v1/docs | Interactive API docs (development only) |

### Option B — frontend with the API mock (no backend, no database)

The mock serves generated example data from `api/openapi.yaml` and validates requests against it.

```bash
pnpm mock:api                                  # terminal 1: mock on http://localhost:4010
VITE_API_TARGET=http://localhost:4010 pnpm dev # terminal 2: web app using the mock
```

### Option C — backend only

Run Terminal 1 of option A and call the API with `curl`, for example:

```bash
curl -i http://localhost:8080/api/v1/health/ready
```

### Stopping and resetting

```bash
docker stop haalendar-db                          # stop the database (data kept)
docker start haalendar-db                         # start it again
docker rm -f haalendar-db && docker volume rm haalendar-db   # delete the dev database completely
```

## 5. Testing and checks

All checks must pass before a pull request (see `CONTRIBUTING.md`).

### Everything at once

```bash
pnpm check           # frontend: generate API client, TypeScript, ESLint, Prettier, unit tests
pnpm backend:check   # backend: Ruff lint, Ruff format, mypy (strict), pytest
pnpm security:audit  # known vulnerabilities in npm and Python dependencies (pnpm audit + pip-audit)
```

### Backend (from `backend/`)

| Command | Purpose |
|---|---|
| `uv run pytest` | Unit and API tests; database tests are skipped unless `HAALENDAR_TEST_DATABASE_URL` is set (see below) |
| `uv run pytest -k health -v` | Run selected tests verbosely |
| `uv run ruff check .` | Lint |
| `uv run ruff format .` | Format (use `--check` in CI) |
| `uv run mypy src tests` | Static types (strict) |
| `uv run haalendar-db-bootstrap` | Create/update the application role from `HAALENDAR_DATABASE_URL` and grant its privileges (needs the owner URL) |
| `uv run alembic upgrade head` | Apply migrations as the owner (`HAALENDAR_MIGRATION_DATABASE_URL`) and refresh the app role's privileges |
| `uv run alembic upgrade head --sql` | Print migration SQL without a database |

Database tests (accounts, sessions, data isolation — marker `db`) create a throw-away database and application role on a PostgreSQL 18 server, run as that least-privilege role and drop both afterwards:

```bash
docker run -d --name haalendar-db-tests -e POSTGRES_USER=haalendar -e POSTGRES_PASSWORD=haalendar   -e POSTGRES_DB=postgres -p 55433:5432 postgres:18
export HAALENDAR_TEST_DATABASE_URL=postgresql+psycopg://haalendar:haalendar@127.0.0.1:55433/postgres
uv run pytest            # all tests including database tests
docker rm -f haalendar-db-tests
```

Database-backed verification (migrations + readiness against a real PostgreSQL 18):

```bash
docker run -d --name haalendar-db-test -e POSTGRES_USER=haalendar -e POSTGRES_PASSWORD=haalendar \
  -e POSTGRES_DB=haalendar -p 55432:5432 postgres:18
export HAALENDAR_MIGRATION_DATABASE_URL=postgresql+psycopg://haalendar:haalendar@127.0.0.1:55432/haalendar
export HAALENDAR_DATABASE_URL=postgresql+psycopg://haalendar_app:haalendar_app@127.0.0.1:55432/haalendar
uv run haalendar-db-bootstrap && uv run alembic upgrade head
uv run haalendar-api &                        # then:
curl -s http://127.0.0.1:8080/api/v1/health/ready   # expect "status":"ready"
kill %1; docker rm -f haalendar-db-test
```

### Frontend (from the repository root)

| Command | Purpose |
|---|---|
| `pnpm test` | Unit/component tests (Vitest, jsdom) |
| `pnpm --filter haalendar-frontend exec vitest` | Tests in watch mode |
| `pnpm --filter haalendar-frontend typecheck` | TypeScript |
| `pnpm --filter haalendar-frontend lint` | ESLint |
| `pnpm --filter haalendar-frontend format` | Prettier (write) |
| `pnpm build` | Production build into `frontend/dist` |
| `pnpm gen:api` | Regenerate the typed API client from `api/openapi.yaml` |

### API contract

From the repository root:

```bash
npx @redocly/cli@2.63.0 lint --config api/redocly.yaml
```

Any change to the API starts with a change to `api/openapi.yaml` (see `api/README.md`).

## 6. Environments

The environment is selected with `HAALENDAR_ENV`.

| | development | test | production | demo |
|---|---|---|---|---|
| Purpose | Local work | Automated tests | Real installations | Public demo stand |
| Status | Available | Available | Not deployable yet (HAAL-150) | Not available yet (HAAL-154) |
| Interactive API docs (`/api/v1/docs`) | On | Off | Off | Off |
| Default secret key | Allowed | Allowed | **Refused** — must be ≥ 32 random characters | Refused |
| `HAALENDAR_PUBLIC_URL` | `http://localhost:8080` | any | **Must be `https://`** (enables HSTS) | `https://` |
| Log format | `json` (or `console` for reading) | `json` | `json` | `json` |
| Database | Local Docker container | None or disposable container | Operator's PostgreSQL 18 | Bundled, reset every 30 min |

- **development** — the default. Use `HAALENDAR_LOG_FORMAT=console` for human-readable logs.
- **test** — used by the test suites; tests build their own settings and never read your `.env`.
- **production** — the backend refuses to start with insecure settings (default secret key, plain `http://`). Generate a key with `openssl rand -base64 48`. Every secret can be passed as a file: `HAALENDAR_SECRET_KEY_FILE=/run/secrets/secret_key`. The planned deployment is Docker Compose (PostgreSQL 18, one-shot migrations, app, worker, optional Caddy for HTTPS) as described in the architecture decisions; it arrives with HAAL-150.
- **demo** — production settings plus `HAALENDAR_DEMO_MODE=true`; data reset every 30 minutes (HAAL-154).

### Trying accounts locally

**First administrator.** On an empty database the web app redirects every page to `/setup` (`pnpm dev`, then open http://localhost:5173). Enter name, e-mail, a password of at least 15 characters (the rules are checked as you type) and the time zone; the account is created as `admin`, already verified, and signed in. If `HAALENDAR_SETUP_TOKEN` is set — always in production — the wizard also asks for it. Without the web app: `POST /api/v1/setup/admin` with the same fields (plus `setup_token`). Once an admin exists, `/setup` is closed (409). To start over in development, empty the accounts tables (`TRUNCATE user_account CASCADE` in `psql`).

**Signing in and managing users.** Sign in at `/login` (the code from the authenticator app is asked for when 2FA is on). Administrators see **Users** in the navigation (`/admin`):

- **Invite** — with SMTP an invitation link (valid 7 days) is e-mailed and the invitee chooses a name and password on `/invite`; inviting the same address again revokes the previous link. Without SMTP (the development default) the account is created at once and a **one-time password** is shown once; the user must set a new password at the first sign-in. Pending invitations are listed above the users and can be revoked.
- **Row actions** — make administrator / regular user, unlock, reset password (link by e-mail, or a one-time password without SMTP), deactivate (signs the user out everywhere, keeps all data) and reactivate. Your own row has no actions, and the last active administrator can never be demoted or deactivated.
- Changes ask for your password again when the last sign-in or confirmation is older than 15 minutes.

**Time zones.** Event times are stored as wall-clock time plus an IANA zone; instants (timestamps in the API) are always UTC and are shown in the profile's zone. The backend reads zone rules only from the pinned `tzdata` package — to pick up new rules, bump `tzdata` in `backend/pyproject.toml` and run the tests (the time atom vectors must still pass).

**Sharing.** `POST /api/v1/shares` shares a container with another active user by e-mail (`view` or `edit`); only the owner shares, changes (`PATCH` with `If-Match`) and revokes (`DELETE`), and a grantee may leave with the same `DELETE`. *Settings → Sharing* lists what you shared and what was shared with you. Calendars become shareable from the calendar list once calendars can be created (HAAL-094); boards and notes follow with their modules.

**Profile.** *Settings → Profile* changes the display name and time zone and uploads a photo (PNG, JPEG or WebP up to 2 MB). The server re-encodes the photo to a 256×256 WebP — location and camera metadata are removed — and stores it under `HAALENDAR_STORAGE_DIR`; removing the photo keeps the stored file. Without `HAALENDAR_STORAGE_DIR` development uses the system temp directory, so photos disappear after a reboot.

**Open sign-up.** An administrator switches *Users → Instance → New accounts* to *Open sign-up*; the sign-in page then links to `/register`. After registering, the confirmation e-mail — without SMTP an `.eml` file in `HAALENDAR_MAIL_DIR` (default `/tmp/haalendar-mail`) — contains the `/verify-email?token=…` link; *Send the link again* issues a new one (at most every 5 minutes, older links stop working).

**Forgotten password.** *Forgot password?* on the sign-in page sends a `/reset-password?token=…` link (valid 1 hour, single use); saving the new password signs the account out everywhere.

**Settings → Security.** Change the password (asks for the current password again; other devices are signed out), turn on two-factor authentication (scan the QR code, confirm a code, store the 10 recovery codes), create new recovery codes, turn 2FA off, and see or sign out signed-in devices.

The session cookie is `__Host-` prefixed and `Secure`: browsers accept it on `https://` and on `http://localhost` only.

### E-mail (SMTP)

Set `HAALENDAR_SMTP_HOST`, `HAALENDAR_SMTP_PORT`, `HAALENDAR_SMTP_SECURITY` (`starttls` on 587 or `ssl` on 465), `HAALENDAR_SMTP_USERNAME`, `HAALENDAR_SMTP_PASSWORD` (or `HAALENDAR_SMTP_PASSWORD_FILE`) and `HAALENDAR_MAIL_FROM`. Credentials over an unencrypted connection are refused at startup. The active mode is logged at startup as `mail_mode` (`SmtpMailer`, `FileMailer` or `DisabledMailer`). Without SMTP in production, an admin resets passwords manually: the user receives a one-time password and must set a new one at the next login.

### Soft delete (critical rule)

Haalendar never removes rows physically — users rely on years of data and on the trash. Four layers enforce it:

1. **Code:** delete with `haalendar.softdelete.soft_delete(obj, actor_id, batch_id)` (sets `deleted_at`, a shared `delete_batch_id`, `version`, `updated_by`), read with `live(Model.deleted_at)`, restore with `restore_batch(...)`. Security records use `revoked_at` / `used_at` instead.
2. **Guards:** any `session.delete()`, `delete()` statement or SQL text with `DELETE FROM` / `TRUNCATE` raises `PhysicalDeleteError` before reaching the database.
3. **Privileges:** the application role has no `DELETE` or `TRUNCATE` privilege.
4. **Triggers:** every table refuses `DELETE` and `TRUNCATE` for every role, including the owner and superusers.

The test suite fails when the code contains a delete construct (rare legitimate cases, such as removing a temporary upload file, carry a `# physical-delete-allowed: <reason>` comment), when a contract `DELETE` lacks `x-soft-delete`, or when a table has no triggers. A migration that creates a table must call `forbid_delete_triggers(table)`, `record_time_triggers(table, created_at=…, updated_at=…)` (the database keeps `updated_at` current and `created_at` unchangeable), `audit_trigger(table, mode, excluded)` — or list the table in `AUDIT_EXEMPT_TABLES` with a reason — and, for owner/share tables, the RLS builders. Tests that need to simulate elapsed time move timestamps with `sql_maintenance(...)` (owner connection in replica mode).

Deliberate maintenance on a throw-away database is done as a superuser with `SET session_replication_role = replica` for that session only — never on real data.

### Trash

`/trash` lists everything the signed-in user may restore, newest deletion first: own content, content in containers shared with edit permission, and deleted containers for their owner. Things deleted together form one entry (with counts of what they contain); restoring brings back the whole delete batch, and nothing is ever purged. A new soft-deletable type registers a `TrashSource` in `haalendar/trash/service.py` (title, who may restore, children of its batch, container lookup); multi-select in lists uses `frontend/src/lib/useSelection.ts`.

### Result notifications and drafts

Every write from the UI goes through `runWrite` (`frontend/src/api/write.ts`): it runs a request of the generated client and reports exactly one result — a success toast, or a failure with a readable reason and Retry (or, inside an open dialog, a reason returned for the dialog to show with `failure: "inline"`). Pass `reasons` for codes that need a domain-specific message and `onFieldErrors` for 422 field errors. `src/api/write-coverage.test.ts` fails when a module imports a write of the generated client without `runWrite`; full-page auth flows are the listed exceptions. The offline outbox reports through `notify.queued` / `notify.synced` (`src/lib/notify.tsx`).

Editors that hold typed text use `useDraft` (`src/lib/useDraft.ts`) with `DraftNotice`: the values are kept in IndexedDB (`haalendar-drafts`, per user) until `commit()` after a confirmed save; call `flush()` right before sending. Never put passwords, codes or tokens into a draft — such field names are refused. Drafts are deleted on sign-out.

### Undo / redo

An undoable write passes `undo` to `runWrite`: a function that turns the server's answer into a step, `newStep(kind, label, payload)` from `frontend/src/lib/undo.ts`. The payload must be plain data (it is kept in the tab's sessionStorage); the inverse requests come from a handler registered once with `registerUndo(kind, { undo, redo })` in a module imported by `App.tsx` (see `components/sharing/undo-sharing.ts`). A handler's `next` returns the payload for the opposite direction, e.g. with the new version for If-Match. Several requests that form one user action are one `batchStep`; prefer the atomic `/bulk` endpoint where it exists.

### Multi-select and bulk actions

Lists select with `useSelection` (`frontend/src/lib/useSelection.ts`): spread `rowProps(id, onOpen)` on a row for Ctrl/Cmd+click, Shift+click and long press, and pass `{ selectAllShortcut: true }` for Ctrl/Cmd+A on the page's main list. `BulkBar` shows the actions the list supports; `runBulk` (`src/lib/bulk.ts`) sends them to `POST /bulk` as one request, one notification and one undo step (pass the rows' current color / priority so a change can be undone). On the server a new kind registers a `BulkSource` in `haalendar/bulk/service.py` (model, supported actions, who may change a row, refusals, children restored with a delete batch).

### Keyboard shortcuts

Register every shortcut through `useShortcut` (`frontend/src/lib/shortcuts.ts`) with a group and a translated label — the "?" overlay lists it while the component is mounted, and the registry handles layouts, Ctrl/Cmd, text fields and open dialogs. Keys a focused widget handles itself are registered without a handler (display only). Lists get keyboard navigation from `useListNavigation` (`src/lib/useListNavigation.ts`): spread `listProps` on the list and `itemProps(id)` on each row; pass `onDelete` to enable the Delete key and confirm with `ConfirmDialog focusConfirm`.

### Unsaved changes

Every editor calls `useUnsavedGuard({ dirty, … })` (`frontend/src/lib/useUnsavedGuard.ts`) and renders `<UnsavedChangesDialog prompt={guard.prompt} />`. Dialog editors close through `guard.requestClose(close)` (from `onOpenChange` and the Cancel button). Pass `hasDraft` with `onLeave` / `onDiscard` for editors that keep a local draft, and `onSave` with `scope` (the form) for Ctrl/Cmd+Enter.

### Attachments

Images hang off items (`item` table, D-45). The API takes the raw body: `POST /api/v1/items/{id}/attachments` with `Content-Type` of the image and the name in `X-File-Name` (percent-encoded). `haalendar/attachments/images.py` decides the type by content, enforces 10 MB / 40 megapixels / 300 frames, re-encodes still images without metadata and makes the thumbnail; files are stored content-addressed and never deleted. In the SPA, `components/attachments/Attachments.tsx` shows and manages the images of an item; editors put `useAttachmentUpload(...).onPaste` on their text fields so a pasted screenshot is attached.

### Priority

The rules live in the atom `items.priority.v1` (`atoms/items.priority.v1`): server code sorts and filters with `rank_sql` / `filter_sql` from `haalendar.atoms.items.priority`, the web app with `sortByPriority` / `filterByPriority` from `src/atoms/items/priority.ts`. UI pieces are in `src/components/ui/priority.tsx` (`PriorityBadge` — pass `hideDefault` in list rows —, `PrioritySelect`, `PriorityFilter`); keep the filter in the route's search params with `parsePriorityParam` / `formatPriorityParam`.

### Colors

User colors come from `frontend/src/lib/palette.ts` (order, default brown) and the `ev-*` classes in `styles.css`: `itemColorClasses(color)` gives a row the 16 % tint and the 4 px bar, `ColorSwatch` / `ColorPicker` (`components/ui/color-picker.tsx`) show and choose colors. Changing a `--ev-*` token is checked by `palette-contrast.test.ts` (text ≥ 4.5:1 on the tint, bar ≥ 3:1, both themes); the palette list itself is checked against the contract and the backend by `backend/tests/test_palette.py`.

### Installable app (PWA) and offline start
<!-- +++===+++ 2026-10-21 — Hasan Alizada — HAAL-051. -->
The service worker (`vite-plugin-pwa`, settings in `frontend/src/pwa-config.ts`) exists in production builds only — `pnpm dev` never registers one. It caches the app shell (built JS/CSS, fonts, icons, `index.html`) and never an API answer; user data offline is the local database (HAAL-052, ADR-0009). A new version waits until the user chooses "Reload". To try it locally:

```bash
cd frontend
pnpm exec vite build
VITE_API_TARGET=http://127.0.0.1:8080 pnpm exec vite preview   # http://localhost:4173, proxies /api/v1
```

Sign in, then stop the backend (or the network) and reload: the app opens with the last profile and the offline banner. Serving in production (HAAL-150): `sw.js`, `workbox-*.js`, `manifest.webmanifest` and `index.html` must be sent with `Cache-Control: no-cache` (otherwise updates do not arrive); hashed files under `assets/` may be cached for a year (`immutable`). DevTools → Application → Service workers shows the registration; "Unregister" resets it.

### Local store and sync (offline-first)
<!-- +++===+++ 2026-10-21 — Hasan Alizada — HAAL-052. -->
Content (calendars, items) is changed only through `mutate(user, change)` from `frontend/src/sync` inside `runWrite({ run: () => mutate(...) })`: the change is written to the user's local database (Dexie, `haalendar-<user id>`) and the outbox in one transaction and synced in the background by the engine the app shell starts (`sync/engine.ts`, `/sync/push` then `/sync/pull`). Screens read the local tables (`localRows`, query keys under `localKeys`), which are invalidated after every local or synced change. Account, settings, sharing, admin and export calls stay online-only and use the generated client as before. Changing the shape of local rows: raise `LOCAL_SCHEMA` in `sync/db.ts` — the next start empties the entity tables and pulls again (the outbox is kept). In DevTools → Application → IndexedDB the `outbox` table shows what has not reached the server; `conflicts` holds changes the server could not take as they were. Tests get an empty IndexedDB per case (`test/setup.ts`); `/sync/pull` answers "nothing to do" and `/sync/push` applies every change by default in `test/fake-api.tsx`.

<!-- +++===+++ 2026-10-22 — Hasan Alizada — HAAL-054. -->
Conflicts the server could not apply are resolved in Settings → Sync (`components/sync/`, logic in `sync/conflicts.ts`: `resolveFields`, `restoreWithMine`, `letGo`). A module screen shows `<ConflictNotice entityId={…} />` in a record's view. Resolved records stay in the `conflicts` table, marked `resolved_at` / `resolution`; only open ones are counted and listed.

### Events and recurrence
<!-- +++===+++ 2026-10-22 — Hasan Alizada — HAAL-066. -->
An event is an item of kind `event` plus its `event` row (`backend/src/haalendar/planning/events.py`): created and changed through `/sync/push` (`op: create` with `kind: "event"`), checked as a whole after every change. Occurrences are computed, never stored: atom `calendar.recurrence.v1` (`backend/src/haalendar/atoms/calendar/recurrence.py`, `frontend/src/atoms/calendar/recurrence.ts`) returns the dates of a series in a window; apply the wall-clock time per date with `time.local_to_utc.v1` and place it in the viewer's days with `time.event_days.v1`. Changing the atom = contract and vectors first, then both implementations, then the manifest hash.

<!-- +++===+++ 2026-10-22 — Hasan Alizada — HAAL-060. -->
The day view (`/calendar?date=YYYY-MM-DD`) is `components/calendar/DayView.tsx` over `lib/dayView.ts` (`entriesOn(rows, date, viewerTz)`): which events and occurrences fall on the viewer's date, their local times, and the order from atom `calendar.day_order.v1`. Tests: `test/day-view.test.tsx` (note that the test user's zone is the device zone).

<!-- +++===+++ 2026-10-22 — Hasan Alizada — HAAL-061. -->
Navigation and the mini month: `components/calendar/MiniMonth.tsx` over `lib/monthGrid.ts`; the layout switches by `useMediaQuery` (`lib/useMediaQuery.ts`, md 768 / lg 1024): inline sidebar, overlay sheet, phone date sheet. jsdom has no layout, so tests set the width with a `matchMedia` stub (`test/calendar-nav.test.tsx`).

### Live updates (SSE)
<!-- +++===+++ 2026-10-22 — Hasan Alizada — HAAL-055. -->
`GET /api/v1/stream` (`backend/src/haalendar/live/`) tells open sessions when to sync: a database trigger sends `pg_notify('haalendar_sync', …)` on commit, the API process listening on that channel wakes the streams of the owner and grantees, and the client pulls. Events carry no data. To watch it: open the app, then DevTools → Network → `stream` (EventStream tab); a change from another browser or `curl` shows `changes` within a second. A reverse proxy must not buffer the stream: Caddy passes it as is; for nginx the response already sends `X-Accel-Buffering: no` (or set `proxy_buffering off` for `/api/v1/stream`). Logs: `live_listening`, `live_stream_opened`, `live_stream_closed` (with `reason`); metric `haalendar_sse_connections`. Backend tests read the stream from a real uvicorn server (`tests/test_live.py`), because TestClient cannot read an endless response.

### Background jobs and data export

Jobs run on Procrastinate (`haalendar/jobs.py`): define a task in `make_job_app`, defer it from the API through `request.app.state.jobs`, run them with `haalendar-worker`. Jobs connect as the application role — set `app.user_id` for the user the job works for, so row-level security applies. The export (`haalendar/exports/`, format in [docs/export](docs/export/README.md)) is built from sections: a module adds its rows and files to `SECTIONS` in `exports/sections.py` and, for new fields, extends the 1.x schema. Physical deletion is allowed only for service data listed in `haalendar.security.no_delete.SERVICE_TABLES` (and files such as expired archives); never for user content or its metadata.

### Audit log

Every change of an audited table (accounts, instance settings, calendars, shares, later events, notes, boards and cards) is written to `audit_log` by a database trigger: actor (`app.user_id`), request id (`app.request_id`, the same as in the log lines and the `X-Request-ID` header), action (`create`, `update`, `delete`, `restore`, `move`, `share`, `unshare`) and the changed fields before/after. The application role can only read it, under row-level security; nobody can change or delete records. History for a record comes from `haalendar.audit.service.history(...)`.

### Observability

- **Logs:** one JSON line per event on stdout (`HAALENDAR_LOG_FORMAT=console` for reading). Every request line has `request_id`, `method`, `route`, `status`, `duration_ms`. Passwords, tokens, cookies and the database URL are always redacted.
- **Correlation:** the web app sends an `X-Request-ID` with every API call and logs it in the browser console for failed calls; the same id appears in the server log line and in error responses (`request_id`).
- **Metrics:** enable and scrape locally:
  ```bash
  export HAALENDAR_METRICS_ENABLED=true HAALENDAR_METRICS_TOKEN=$(openssl rand -hex 24)
  uv run haalendar-api &
  curl -s -H "Authorization: Bearer $HAALENDAR_METRICS_TOKEN" http://localhost:8080/metrics | grep ^haalendar_
  ```
  Exposed: `haalendar_http_requests_total`, `haalendar_http_request_duration_seconds` (labelled by route template, never by raw URL), `haalendar_http_requests_in_progress`, `haalendar_db_pool_*`, `haalendar_db_slow_queries_total`, `haalendar_build_info`.

## 7. Configuration reference

All variables, defaults and comments are in [`.env.example`](.env.example). The most important ones:

| Variable | Default | Notes |
|---|---|---|
| `HAALENDAR_ENV` | `development` | `development` / `test` / `production` |
| `HAALENDAR_DATABASE_URL` | `postgresql+psycopg://haalendar_app:haalendar_app@localhost:5432/haalendar` | Application role (least privilege); secret, or `HAALENDAR_DATABASE_URL_FILE`; must be set in production |
| `HAALENDAR_MIGRATION_DATABASE_URL` | `postgresql+psycopg://haalendar:haalendar@localhost:5432/haalendar` | Owner role for migrations and `haalendar-db-bootstrap` only; not needed by the running app |
| `HAALENDAR_SECRET_KEY` | development placeholder | Required in production |
| `HAALENDAR_PUBLIC_URL` | `http://localhost:8080` | `https://` in production |
| `HAALENDAR_STORAGE_DIR` | system temp directory | File storage root (avatars); required in production, must be a persistent volume and be backed up with the database |
| `HAALENDAR_SETUP_TOKEN` | — | Token for the first-run admin wizard; mandatory in production, optional in development |
| `HAALENDAR_PORT` | `8080` | API port |
| `HAALENDAR_LOG_LEVEL` / `HAALENDAR_LOG_FORMAT` | `INFO` / `json` | `console` for local reading |
| `HAALENDAR_DB_SLOW_QUERY_MS` | `200` | Log SQL slower than this (0 = off) |
| `HAALENDAR_METRICS_ENABLED` / `HAALENDAR_METRICS_TOKEN` | `false` / — | Prometheus metrics at `/metrics`, bearer token ≥ 24 chars required |
| `HAALENDAR_EXTRA_ALLOWED_HOSTS` / `HAALENDAR_EXTRA_ALLOWED_ORIGINS` | empty | Additional Host names / origins (public URL and loopback are always allowed) |
| `HAALENDAR_RATE_LIMIT_PER_MINUTE` / `HAALENDAR_RATE_LIMIT_BURST` | `600` / `120` | Per-client rate limit (0 = off) |
| `HAALENDAR_AUTH_RATE_LIMIT_PER_MINUTE` / `HAALENDAR_AUTH_RATE_LIMIT_BURST` | `20` / `10` | Additional per-client limit for `/api/v1/auth/*` |
| `HAALENDAR_MAX_REQUEST_BODY_BYTES` | `1048576` | Request body limit |
| `VITE_API_TARGET` | `http://localhost:8080` | Frontend dev proxy target (`http://localhost:4010` for the mock) |

## 8. Troubleshooting

| Symptom | Cause and fix |
|---|---|
| `pnpm install` fails with "within the minimumReleaseAge cutoff" | Supply-chain policy: versions younger than 7 days are refused. Choose an older version; do not disable the policy. |
| `ERR_PNPM_IGNORED_BUILDS` | A dependency wants to run an install script. Review it and allow or deny it with `pnpm approve-builds`; scripts are blocked by default. |
| 400 `Host not allowed` | The request used a host name that is not the public URL host or loopback (for example a LAN IP). Add it to `HAALENDAR_EXTRA_ALLOWED_HOSTS`. |
| 403 `csrf_failed` on POST/PATCH/DELETE | The request came from an origin other than the public URL (or the Vite dev server in development). Add it to `HAALENDAR_EXTRA_ALLOWED_ORIGINS` if it is legitimate. |
| 429 `account_locked` on login | 5 consecutive failed logins lock the account (15 min, doubling up to 24 h). Wait for `Retry-After`, or an admin unlocks the account. In development: `UPDATE user_account SET failed_login_count = 0, locked_until = NULL`. |
| 429 `rate_limited` | Too many requests from one client; wait for `Retry-After` seconds or raise the limit for local load tests. |
| Backend refuses to start: "superuser or BYPASSRLS role" | `HAALENDAR_DATABASE_URL` points to the owner/superuser. Run `uv run haalendar-db-bootstrap` and connect as the application role. |
| `permission denied for table …` | The app role lacks privileges on a new table: run `uv run alembic upgrade head` (it refreshes grants) or `uv run haalendar-db-bootstrap`. |
| 403 `forbidden` on the setup page | Production requires `HAALENDAR_SETUP_TOKEN` to be set on the server and entered in the wizard; check both values. |
| `Physical DELETE on table … is forbidden` / `PhysicalDeleteError` | Soft delete only: set `deleted_at` (or `revoked_at`) instead — see *Soft delete (critical rule)*. |
| `/api/v1/health/ready` returns 503 with `"database": false` | PostgreSQL is not running or `HAALENDAR_DATABASE_URL` is wrong. Check `docker ps`. |
| 503 with `"migrations": false` | Run `uv run alembic upgrade head` in `backend/`. |
| PostgreSQL container exits immediately | Old volume mounted at `/var/lib/postgresql/data`; use `/var/lib/postgresql` for PostgreSQL 18. |
| Backend refuses to start: "SECRET_KEY must be set" | `HAALENDAR_ENV=production` with the default key; set a random key of ≥ 32 characters. |
| Address already in use (8080, 5173, 4010, 5432) | Another process uses the port; stop it or change `HAALENDAR_PORT` / the Docker `-p` mapping. |
| Very slow installs or tests in WSL | The repository is on a Windows drive (`/mnt/...`). Clone it into the Linux file system (`~/src/...`) for 5–10× faster I/O, and keep `UV_PROJECT_ENVIRONMENT` outside the repo. |
| `node` or `pnpm` runs the Windows version | Windows paths precede Linux paths in WSL `PATH`; make sure nvm's `node` comes first (`which node`). |
