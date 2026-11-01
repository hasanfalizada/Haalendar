#!/usr/bin/env bash
# +++===+++ 2026-10-28 CET — Hasan Alizada — Throw-away full stack for live checks: PostgreSQL 18 (container
# haalendar-dev-db, port 55434, data lost on stack-down), API on 8081, job worker, Vite on 5173 — all bound to
# 127.0.0.1. Open it at http://localhost:5173: from another computer through an SSH tunnel
# (ssh -N -L 5173:localhost:5173 <user>@<this host>; JetBrains Gateway can forward the port too). Not by host name:
# plain http on a host name is not a secure context, so browser APIs the app needs (crypto.randomUUID, service
# worker) are missing there. Logs, uploads and the session ids live in <repo>/.dev (git-ignored);
# each process runs in its own session (setsid), so stack-down stops it with all its children.
# Usage: scripts/dev/stack-up.sh   then open the printed URL; stop with scripts/dev/stack-down.sh
# +++===+++ 2026-10-31 — Hasan Alizada — HAAL-142. --preview also builds the web app for production and serves it with
# `vite preview` on http://localhost:4173 (same API): the build with the service worker, so the app opens offline
# after a reload (D-55). The offline end-to-end tests use it.
# +++===+++ 2026-11-01 — Hasan Alizada — HAAL-144. --scan prepares the API for a scanner (scripts/dev/dast.sh): rate
# limits raised (a scanner would otherwise get mostly 429) and the Docker bridge address ($SCAN_HOST, default
# 172.17.0.1) accepted as Host, so the scanner in its container reaches the API through dast.sh's forwarder.
# +++===+++ 2026-11-01 — Hasan Alizada — HAAL-145. Refuses to start when one of its ports is taken by another program
# (scripts/dev/ports-free.sh); the API's port can be moved with STACK_API_PORT (default 8081).
set -uo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"
export PATH="$HOME/.local/bin:$PATH"
# shellcheck disable=SC1091
[ -s "$HOME/.nvm/nvm.sh" ] && . "$HOME/.nvm/nvm.sh" >/dev/null

PREVIEW=0
SCAN=0
for arg in "$@"; do
  case "$arg" in
    --preview) PREVIEW=1 ;;
    --scan) SCAN=1 ;;
    *) echo "unknown option: $arg (--preview, --scan)"; exit 2 ;;
  esac
done
DB=haalendar-dev-db
DEV_DIR="$ROOT/.dev"
URL="http://localhost:5173"
API_PORT="${STACK_API_PORT:-8081}"
"$ROOT/scripts/dev/stack-down.sh" >/dev/null 2>&1
PORTS=("$API_PORT" 5173 55434)
[ "$PREVIEW" = 1 ] && PORTS+=(4173)
"$ROOT/scripts/dev/ports-free.sh" "${PORTS[@]}" || { echo "stack not started (the API's port: STACK_API_PORT=<free port>)"; exit 1; }
# +++===+++ 2026-10-30 — Hasan Alizada — After stack-down, which removes the previous stack's uploads and mail.
mkdir -p "$DEV_DIR/storage" "$DEV_DIR/mail"
docker run -d --name "$DB" -e POSTGRES_USER=haalendar -e POSTGRES_PASSWORD=haalendar -e POSTGRES_DB=haalendar \
  -p 127.0.0.1:55434:5432 postgres:18 >/dev/null || { echo "docker run failed"; exit 1; }
for _ in $(seq 1 60); do docker exec "$DB" pg_isready -U haalendar -q && break; sleep 1; done

set -a; source .env.example; set +a
export HAALENDAR_DATABASE_URL=postgresql+psycopg://haalendar_app:haalendar_app@localhost:55434/haalendar
export HAALENDAR_MIGRATION_DATABASE_URL=postgresql+psycopg://haalendar:haalendar@localhost:55434/haalendar
export HAALENDAR_STORAGE_DIR="$DEV_DIR/storage" HAALENDAR_MAIL_DIR="$DEV_DIR/mail"
export HAALENDAR_BIND_HOST=127.0.0.1 HAALENDAR_PORT="$API_PORT" HAALENDAR_PUBLIC_URL="$URL"
# The production build on 4173 sends unsafe requests from its own origin (CSRF Origin check).
export HAALENDAR_EXTRA_ALLOWED_ORIGINS=http://localhost:4173,http://127.0.0.1:4173
if [ "$SCAN" = 1 ]; then
  export HAALENDAR_RATE_LIMIT_PER_MINUTE=100000 HAALENDAR_RATE_LIMIT_BURST=10000
  export HAALENDAR_AUTH_RATE_LIMIT_PER_MINUTE=1000 HAALENDAR_AUTH_RATE_LIMIT_BURST=500
  export HAALENDAR_EXTRA_ALLOWED_HOSTS="${SCAN_HOST:-172.17.0.1}"
fi
cd backend
uv run haalendar-db-bootstrap >"$DEV_DIR/bootstrap.log" 2>&1 || { echo "bootstrap failed, see $DEV_DIR/bootstrap.log"; exit 1; }
uv run alembic upgrade head >"$DEV_DIR/migrate.log" 2>&1 || { echo "migrations failed, see $DEV_DIR/migrate.log"; exit 1; }
# Each process gets its own session; the session leader records its id ($$) so stack-down can stop the whole session.
start() { local log=$1; shift; setsid bash -c 'echo $$ >>"$0"; exec "$@"' "$DEV_DIR/sessions" "$@" >"$DEV_DIR/$log" 2>&1 </dev/null & }
rm -f "$DEV_DIR/sessions"
start api.log uv run haalendar-api
start worker.log uv run haalendar-worker
cd ../frontend
VITE_API_TARGET=http://127.0.0.1:$API_PORT start vite.log pnpm exec vite --host 127.0.0.1 --port 5173 --strictPort
if [ "$PREVIEW" = 1 ]; then
  pnpm build >"$DEV_DIR/build.log" 2>&1 || { echo "build failed, see $DEV_DIR/build.log"; exit 1; }
  VITE_API_TARGET=http://127.0.0.1:$API_PORT start preview.log pnpm exec vite preview --host 127.0.0.1 --port 4173 --strictPort
fi

for _ in $(seq 1 90); do curl -s -o /dev/null "http://127.0.0.1:5173/api/v1/health/live" && break; sleep 1; done
echo "api:   $(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:$API_PORT/api/v1/health/ready)"
echo "web:   $(curl -s -o /dev/null -w '%{http_code}' http://localhost:5173/)"
echo "setup: $(curl -s http://127.0.0.1:5173/api/v1/setup/status)"
if [ "$PREVIEW" = 1 ]; then
  for _ in $(seq 1 30); do curl -s -o /dev/null "http://127.0.0.1:4173/" && break; sleep 1; done
  echo "build: $(curl -s -o /dev/null -w '%{http_code}' http://localhost:4173/)   (production build with the service worker)"
fi
echo "open:  $URL   (logs: $DEV_DIR)"
echo "from another computer: ssh -N -L 5173:localhost:5173 $USER@$(hostname -f)   then open $URL there"
