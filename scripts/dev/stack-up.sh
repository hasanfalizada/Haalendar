#!/usr/bin/env bash
# +++===+++ 2026-10-28 CET — Hasan Alizada — Throw-away full stack for live checks: PostgreSQL 18 (container
# haalendar-dev-db, port 55434, data lost on stack-down), API on 8081, job worker, Vite on 5173 — all bound to
# 127.0.0.1. Open it at http://localhost:5173: from another computer through an SSH tunnel
# (ssh -N -L 5173:localhost:5173 <user>@<this host>; JetBrains Gateway can forward the port too). Not by host name:
# plain http on a host name is not a secure context, so browser APIs the app needs (crypto.randomUUID, service
# worker) are missing there. Logs, uploads and the session ids live in <repo>/.dev (git-ignored);
# each process runs in its own session (setsid), so stack-down stops it with all its children.
# Usage: scripts/dev/stack-up.sh   then open the printed URL; stop with scripts/dev/stack-down.sh
set -uo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"
export PATH="$HOME/.local/bin:$PATH"
# shellcheck disable=SC1091
[ -s "$HOME/.nvm/nvm.sh" ] && . "$HOME/.nvm/nvm.sh" >/dev/null

DB=haalendar-dev-db
DEV_DIR="$ROOT/.dev"
URL="http://localhost:5173"
mkdir -p "$DEV_DIR/storage" "$DEV_DIR/mail"

"$ROOT/scripts/dev/stack-down.sh" >/dev/null 2>&1
docker run -d --name "$DB" -e POSTGRES_USER=haalendar -e POSTGRES_PASSWORD=haalendar -e POSTGRES_DB=haalendar \
  -p 127.0.0.1:55434:5432 postgres:18 >/dev/null || { echo "docker run failed"; exit 1; }
for _ in $(seq 1 60); do docker exec "$DB" pg_isready -U haalendar -q && break; sleep 1; done

set -a; source .env.example; set +a
export HAALENDAR_DATABASE_URL=postgresql+psycopg://haalendar_app:haalendar_app@localhost:55434/haalendar
export HAALENDAR_MIGRATION_DATABASE_URL=postgresql+psycopg://haalendar:haalendar@localhost:55434/haalendar
export HAALENDAR_STORAGE_DIR="$DEV_DIR/storage" HAALENDAR_MAIL_DIR="$DEV_DIR/mail"
export HAALENDAR_BIND_HOST=127.0.0.1 HAALENDAR_PORT=8081 HAALENDAR_PUBLIC_URL="$URL"
cd backend
uv run haalendar-db-bootstrap >"$DEV_DIR/bootstrap.log" 2>&1 || { echo "bootstrap failed, see $DEV_DIR/bootstrap.log"; exit 1; }
uv run alembic upgrade head >"$DEV_DIR/migrate.log" 2>&1 || { echo "migrations failed, see $DEV_DIR/migrate.log"; exit 1; }
# Each process gets its own session; the session leader records its id ($$) so stack-down can stop the whole session.
start() { local log=$1; shift; setsid bash -c 'echo $$ >>"$0"; exec "$@"' "$DEV_DIR/sessions" "$@" >"$DEV_DIR/$log" 2>&1 </dev/null & }
rm -f "$DEV_DIR/sessions"
start api.log uv run haalendar-api
start worker.log uv run haalendar-worker
cd ../frontend
VITE_API_TARGET=http://127.0.0.1:8081 start vite.log pnpm exec vite --host 127.0.0.1 --port 5173 --strictPort

for _ in $(seq 1 90); do curl -s -o /dev/null "http://127.0.0.1:5173/api/v1/health/live" && break; sleep 1; done
echo "api:   $(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:8081/api/v1/health/ready)"
echo "web:   $(curl -s -o /dev/null -w '%{http_code}' http://localhost:5173/)"
echo "setup: $(curl -s http://127.0.0.1:5173/api/v1/setup/status)"
echo "open:  $URL   (logs: $DEV_DIR)"
echo "from another computer: ssh -N -L 5173:localhost:5173 $USER@$(hostname -f)   then open $URL there"
