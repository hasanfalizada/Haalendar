#!/usr/bin/env bash
# +++===+++ 2026-10-28 CET — Hasan Alizada — Full check before a task is called done (rule 0.9): API contract lint,
# backend (Ruff, mypy, pytest incl. database tests on a throw-away PostgreSQL 18), dependency audit, secret scan and
# licences (HAAL-144), frontend (codegen, TypeScript, ESLint, Prettier, Vitest) and the production build. Read-only: it
# never formats or fixes code.
# Usage: scripts/dev/check-all.sh   (exit code 0 only when every step passes)
# +++===+++ 2026-10-30 — Hasan Alizada — HAAL-140. Coverage gates in the backend and frontend steps; the end-to-end
# tests' TypeScript and Prettier always, the end-to-end tests themselves with --e2e (they start and stop the throw-away
# stack, about a minute more): scripts/dev/check-all.sh --e2e
# +++===+++ 2026-11-08 — Hasan Alizada — HAAL-151. The same steps run in CI (.github/workflows/ci.yml): each job runs
# some of them with --only <step>[,<step>…] (steps: contract, backend, audit, secrets, licences, workflows, frontend,
# build, e2e-static, e2e), so CI and this script can never check different things. New step "workflows": actionlint
# and zizmor over the GitHub Actions files.
set -uo pipefail
E2E=0
ONLY=""
STEPS="contract backend audit secrets licences workflows frontend build e2e-static e2e"
while [ $# -gt 0 ]; do
  case "$1" in
    --e2e) E2E=1 ;;
    --only)
      [ -n "${2:-}" ] || { echo "--only needs steps (steps: $STEPS)"; exit 2; }
      ONLY=",$2,"
      for wanted in ${2//,/ }; do
        case " $STEPS " in *" $wanted "*) ;; *) echo "unknown step: $wanted (steps: $STEPS)"; exit 2 ;; esac
      done
      shift ;;
    *) echo "unknown option: $1 (--e2e, --only <step>[,<step>…])"; exit 2 ;;
  esac
  shift
done
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"
export PATH="$HOME/.local/bin:$PATH"
# shellcheck disable=SC1091
[ -s "$HOME/.nvm/nvm.sh" ] && . "$HOME/.nvm/nvm.sh" >/dev/null

DB=haalendar-check-db
PORT=55433
# +++===+++ 2026-11-08 — Hasan Alizada — HAAL-151. The PostgreSQL of the installation (compose.yaml, pinned by digest).
PG_IMAGE=$(grep -m1 -oE 'postgres:[^ ]+' "$ROOT/compose.yaml")
ACTIONLINT="rhysd/actionlint:1.7.12@sha256:b1934ee5f1c509618f2508e6eb47ee0d3520686341fec936f3b79331f9315667"
ZIZMOR="ghcr.io/zizmorcore/zizmor:1.31.1@sha256:42d409dbb851d4c5d35a058cf042b828bea1e3f2884378c526eb0974780e18d9"
FAILED=()
RAN=0
# Without --only every step runs (e2e only with --e2e); with it only the steps named.
wanted() {
  if [ -n "$ONLY" ]; then case "$ONLY" in *",$1,"*) return 0 ;; *) return 1 ;; esac; fi
  [ "$1" != e2e ] || [ "$E2E" -eq 1 ]
}
step() {
  local key=$1 name=$2; shift 2
  wanted "$key" || return 0
  RAN=$((RAN + 1))
  echo "== $name"
  local start=$SECONDS
  if "$@"; then echo "-- $name: OK ($((SECONDS - start)) s)"; else echo "-- $name: FAILED"; FAILED+=("$name"); fi
}
# +++===+++ 2026-11-01 — Hasan Alizada — HAAL-145. With its anonymous data volume (-v), which otherwise stays behind.
cleanup() { docker rm -f -v "$DB" >/dev/null 2>&1; }
trap cleanup EXIT

start_db() {
  cleanup
  docker run -d --name "$DB" -e POSTGRES_USER=haalendar -e POSTGRES_PASSWORD=haalendar -e POSTGRES_DB=postgres \
    -p "127.0.0.1:$PORT:5432" "$PG_IMAGE" >/dev/null || return 1
  for _ in $(seq 1 60); do docker exec "$DB" pg_isready -U haalendar -q && return 0; sleep 1; done
  echo "PostgreSQL did not become ready"; return 1
}
backend() { start_db && HAALENDAR_TEST_DATABASE_URL="postgresql+psycopg://haalendar:haalendar@127.0.0.1:$PORT/postgres" \
  pnpm backend:check; }
# +++===+++ 2026-11-08 — Hasan Alizada — HAAL-151. The workflow files: actionlint (syntax, expressions, shellcheck of
# the run steps) and zizmor (security: injection, permissions, pinning, credentials), both MIT, pinned by digest.
workflows() {
  local status=0
  docker run --rm -v "$ROOT:/repo:ro" -w /repo "$ACTIONLINT" -no-color || status=1
  docker run --rm -v "$ROOT:/repo:ro" -w /repo "$ZIZMOR" --offline --no-progress .github/ || status=1
  return "$status"
}

step contract "contract lint" npx -y @redocly/cli@2.63.0 lint --config api/redocly.yaml
step backend "backend" backend
step audit "dependency audit" pnpm security:audit
# +++===+++ 2026-11-01 — Hasan Alizada — HAAL-144. Secrets in the history and the working tree; licences of every
# dependency against the policy (docs/security/security-baseline.md §7).
step secrets "secret scan" scripts/dev/secrets-scan.sh
step licences "licences" pnpm security:licences
step workflows "workflow lint" workflows
step frontend "frontend" pnpm check
step build "build" pnpm build
step e2e-static "e2e static" pnpm --filter haalendar-e2e check
step e2e "e2e" pnpm e2e

if [ "$RAN" -eq 0 ]; then echo "no step ran"; exit 2; fi
if [ ${#FAILED[@]} -eq 0 ]; then echo "ALL CHECKS PASSED"; else echo "FAILED: ${FAILED[*]}"; exit 1; fi
