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

Apply migrations:

```bash
cd backend
set -a; source ../.env; set +a
uv run alembic upgrade head
```

## 4. Running the app

### Option A — full stack (backend + frontend)

Terminal 1 — API on `http://localhost:8080`:

```bash
cd backend
set -a; source ../.env; set +a
uv run haalendar-api
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
| `uv run pytest` | Unit and API tests (no database needed) |
| `uv run pytest -k health -v` | Run selected tests verbosely |
| `uv run ruff check .` | Lint |
| `uv run ruff format .` | Format (use `--check` in CI) |
| `uv run mypy src tests` | Static types (strict) |
| `uv run alembic upgrade head` | Apply migrations to the database in `HAALENDAR_DATABASE_URL` |
| `uv run alembic upgrade head --sql` | Print migration SQL without a database |

Database-backed verification (migrations + readiness against a real PostgreSQL 18):

```bash
docker run -d --name haalendar-db-test -e POSTGRES_USER=haalendar -e POSTGRES_PASSWORD=haalendar \
  -e POSTGRES_DB=haalendar -p 55432:5432 postgres:18
export HAALENDAR_DATABASE_URL=postgresql+psycopg://haalendar:haalendar@127.0.0.1:55432/haalendar
uv run alembic upgrade head
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
| `HAALENDAR_DATABASE_URL` | `postgresql+psycopg://haalendar:haalendar@localhost:5432/haalendar` | Secret; or `HAALENDAR_DATABASE_URL_FILE` |
| `HAALENDAR_SECRET_KEY` | development placeholder | Required in production |
| `HAALENDAR_PUBLIC_URL` | `http://localhost:8080` | `https://` in production |
| `HAALENDAR_PORT` | `8080` | API port |
| `HAALENDAR_LOG_LEVEL` / `HAALENDAR_LOG_FORMAT` | `INFO` / `json` | `console` for local reading |
| `HAALENDAR_DB_SLOW_QUERY_MS` | `200` | Log SQL slower than this (0 = off) |
| `HAALENDAR_METRICS_ENABLED` / `HAALENDAR_METRICS_TOKEN` | `false` / — | Prometheus metrics at `/metrics`, bearer token ≥ 24 chars required |
| `HAALENDAR_EXTRA_ALLOWED_HOSTS` / `HAALENDAR_EXTRA_ALLOWED_ORIGINS` | empty | Additional Host names / origins (public URL and loopback are always allowed) |
| `HAALENDAR_RATE_LIMIT_PER_MINUTE` / `HAALENDAR_RATE_LIMIT_BURST` | `600` / `120` | Per-client rate limit (0 = off) |
| `HAALENDAR_MAX_REQUEST_BODY_BYTES` | `1048576` | Request body limit |
| `VITE_API_TARGET` | `http://localhost:8080` | Frontend dev proxy target (`http://localhost:4010` for the mock) |

## 8. Troubleshooting

| Symptom | Cause and fix |
|---|---|
| `pnpm install` fails with "within the minimumReleaseAge cutoff" | Supply-chain policy: versions younger than 7 days are refused. Choose an older version; do not disable the policy. |
| `ERR_PNPM_IGNORED_BUILDS` | A dependency wants to run an install script. Review it and allow or deny it with `pnpm approve-builds`; scripts are blocked by default. |
| 400 `Host not allowed` | The request used a host name that is not the public URL host or loopback (for example a LAN IP). Add it to `HAALENDAR_EXTRA_ALLOWED_HOSTS`. |
| 403 `csrf_failed` on POST/PATCH/DELETE | The request came from an origin other than the public URL (or the Vite dev server in development). Add it to `HAALENDAR_EXTRA_ALLOWED_ORIGINS` if it is legitimate. |
| 429 `rate_limited` | Too many requests from one client; wait for `Retry-After` seconds or raise the limit for local load tests. |
| `/api/v1/health/ready` returns 503 with `"database": false` | PostgreSQL is not running or `HAALENDAR_DATABASE_URL` is wrong. Check `docker ps`. |
| 503 with `"migrations": false` | Run `uv run alembic upgrade head` in `backend/`. |
| PostgreSQL container exits immediately | Old volume mounted at `/var/lib/postgresql/data`; use `/var/lib/postgresql` for PostgreSQL 18. |
| Backend refuses to start: "SECRET_KEY must be set" | `HAALENDAR_ENV=production` with the default key; set a random key of ≥ 32 characters. |
| Address already in use (8080, 5173, 4010, 5432) | Another process uses the port; stop it or change `HAALENDAR_PORT` / the Docker `-p` mapping. |
| Very slow installs or tests in WSL | The repository is on a Windows drive (`/mnt/...`). Clone it into the Linux file system (`~/src/...`) for 5–10× faster I/O, and keep `UV_PROJECT_ENVIRONMENT` outside the repo. |
| `node` or `pnpm` runs the Windows version | Windows paths precede Linux paths in WSL `PATH`; make sure nvm's `node` comes first (`which node`). |
