#!/usr/bin/env bash
# +++===+++ 2026-10-28 CET — Hasan Alizada — Full check before a task is called done (rule 0.9): API contract lint,
# backend (Ruff, mypy, pytest incl. database tests on a throw-away PostgreSQL 18), dependency audit, frontend
# (codegen, TypeScript, ESLint, Prettier, Vitest) and the production build. Read-only: it never formats or fixes code.
# Usage: scripts/dev/check-all.sh   (exit code 0 only when every step passes)
set -uo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"
export PATH="$HOME/.local/bin:$PATH"
# shellcheck disable=SC1091
[ -s "$HOME/.nvm/nvm.sh" ] && . "$HOME/.nvm/nvm.sh" >/dev/null

DB=haalendar-check-db
PORT=55433
FAILED=()
step() {
  local name=$1; shift
  echo "== $name"
  local start=$SECONDS
  if "$@"; then echo "-- $name: OK ($((SECONDS - start)) s)"; else echo "-- $name: FAILED"; FAILED+=("$name"); fi
}
cleanup() { docker rm -f "$DB" >/dev/null 2>&1; }
trap cleanup EXIT

start_db() {
  cleanup
  docker run -d --name "$DB" -e POSTGRES_USER=haalendar -e POSTGRES_PASSWORD=haalendar -e POSTGRES_DB=postgres \
    -p "127.0.0.1:$PORT:5432" postgres:18 >/dev/null || return 1
  for _ in $(seq 1 60); do docker exec "$DB" pg_isready -U haalendar -q && return 0; sleep 1; done
  echo "PostgreSQL did not become ready"; return 1
}

step "contract lint" npx -y @redocly/cli@2.63.0 lint --config api/redocly.yaml
step "test database" start_db
export HAALENDAR_TEST_DATABASE_URL="postgresql+psycopg://haalendar:haalendar@127.0.0.1:$PORT/postgres"
step "backend" pnpm backend:check
step "dependency audit" pnpm security:audit
step "frontend" pnpm check
step "build" pnpm build

if [ ${#FAILED[@]} -eq 0 ]; then echo "ALL CHECKS PASSED"; else echo "FAILED: ${FAILED[*]}"; exit 1; fi
