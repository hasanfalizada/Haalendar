#!/usr/bin/env bash
# +++===+++ 2026-11-01 — Hasan Alizada — HAAL-150. Checks the production installation (compose.yaml) end to end: builds
# the image, starts db, migrate, app, worker and the bundled Caddy in their own Compose project (ports on loopback
# only, random secrets, the setup token required), runs the whole end-to-end suite against the app (desktop and
# offline), stops and starts the stack to see the data survive, checks HTTPS through Caddy, then removes the project
# with its volumes. Throw-away data only.
# Usage: scripts/dev/compose-check.sh [--no-build]   (exit code 0 only when every step passes)
set -uo pipefail
BUILD=1
for arg in "$@"; do
  case "$arg" in
    --no-build) BUILD=0 ;;
    *) echo "unknown option: $arg (only --no-build)"; exit 2 ;;
  esac
done
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
DIR="$ROOT/.dev/compose-check"
PROJECT=haalendar-check
APP=http://localhost:18080
HTTPS=https://localhost:18443
# shellcheck disable=SC1091
[ -s "$HOME/.nvm/nvm.sh" ] && . "$HOME/.nvm/nvm.sh" >/dev/null

FAILED=()
check() {
  local name=$1; shift
  echo "== $name"
  if "$@"; then echo "   ok"; else echo "   FAILED"; FAILED+=("$name"); fi
}
dc() { docker compose -p "$PROJECT" --project-directory "$DIR" --profile proxy "$@"; }
cleanup() {
  dc down -v --remove-orphans >/dev/null 2>&1
  # physical-delete-allowed: throw-away installation of this check (copied files, generated secrets) — no user content
  rm -rf "$DIR"
}
trap cleanup EXIT

if [ "$BUILD" = 1 ]; then
  echo "== build haalendar:dev"
  docker build -q -t haalendar:dev "$ROOT" >/dev/null || { echo "   FAILED"; exit 1; }
fi

cleanup
mkdir -p "$DIR"
cp "$ROOT/compose.yaml" "$ROOT/Caddyfile" "$DIR/"
TOKEN=$(openssl rand -hex 32)
cat >"$DIR/.env" <<EOF
HAALENDAR_IMAGE=haalendar:dev
HAALENDAR_PUBLIC_URL=$HTTPS
HAALENDAR_DOMAIN=localhost
HAALENDAR_SECRET_KEY=$(openssl rand -hex 32)
HAALENDAR_SETUP_TOKEN=$TOKEN
POSTGRES_PASSWORD=$(openssl rand -hex 24)
HAALENDAR_APP_DB_PASSWORD=$(openssl rand -hex 24)
HAALENDAR_HTTP_PORT=18080
HAALENDAR_WEB_SUBNET=172.30.251.0/24
# Test only: the suite opens the app directly on $APP, and its browser reloads far faster than a person does.
HAALENDAR_EXTRA_ALLOWED_ORIGINS=$APP
HAALENDAR_RATE_LIMIT_PER_MINUTE=100000
HAALENDAR_RATE_LIMIT_BURST=10000
HAALENDAR_AUTH_RATE_LIMIT_PER_MINUTE=1000
HAALENDAR_AUTH_RATE_LIMIT_BURST=500
EOF
chmod 600 "$DIR/.env"
# Caddy on loopback only (compose.yaml publishes it on every interface for a real installation).
cat >"$DIR/compose.override.yaml" <<'EOF'
services:
  proxy:
    ports: !override
      - "127.0.0.1:18088:80"
      - "127.0.0.1:18443:443"
EOF

healthy() {
  local s
  for _ in $(seq 1 60); do
    s=$(dc ps --format '{{.Service}}={{.Health}}' | tr '\n' ' ')
    case "$s" in *app=healthy*) case "$s" in *worker=healthy*) return 0 ;; esac ;; esac
    sleep 3
  done
  echo "   $s"; dc logs --tail 30 migrate app worker; return 1
}
ready() { curl -fsS "$APP/api/v1/health/ready" | grep -q '"rls_enforced":true'; }
setup_done() { curl -fsS "$APP/api/v1/setup/status" | grep -q '"setup_required":false'; }

# +++===+++ 2026-11-01 — Hasan Alizada — HAAL-145. Without the bundled proxy its domain is not needed.
check "without the bundled proxy no HAALENDAR_DOMAIN is needed" sh -c \
  "grep -v '^HAALENDAR_DOMAIN=' '$DIR/.env' >'$DIR/no-domain.env' && docker compose -p $PROJECT --project-directory '$DIR' --env-file '$DIR/no-domain.env' config -q"

echo "== start"
dc up -d --quiet-pull >/dev/null 2>&1 || { dc up -d; exit 1; }
check "healthy" healthy
check "ready, row-level security enforced" ready
check "the setup token is required" sh -c "curl -fsS $APP/api/v1/setup/status | grep -q '\"setup_token_required\":true'"
check "end-to-end suite" env -C "$ROOT/e2e" E2E_BASE_URL="$APP" E2E_OFFLINE_URL="$APP" E2E_SETUP_TOKEN="$TOKEN" \
  npx playwright test --reporter=dot
echo "== stop and start"
dc down >/dev/null 2>&1 && dc up -d >/dev/null 2>&1
check "healthy again" healthy
check "the data survived (the instance stays set up)" setup_done
https_headers() {
  local h
  h=$(curl -ksS -D - -o /dev/null "$HTTPS/") || return 1
  echo "$h" | grep -q "^HTTP/2 200" && echo "$h" | grep -qi "^content-security-policy: default-src 'self'; script-src 'self';" &&
    echo "$h" | grep -qi "^strict-transport-security:" && ! echo "$h" | grep -qi "^server:"
}
check "HTTPS through Caddy: HTTP/2, CSP, HSTS, no Server header" https_headers
check "HTTPS through Caddy: API ready" sh -c "curl -ksSf $HTTPS/api/v1/health/ready | grep -q '\"status\":\"ready\"'"
check "HTTP redirects to HTTPS" sh -c "curl -sS -o /dev/null -w '%{http_code} %{redirect_url}' http://localhost:18088/ | grep -q '^30[18] https://localhost/'"

if [ ${#FAILED[@]} -eq 0 ]; then echo "compose check: all passed"; exit 0; fi
printf 'compose check FAILED: %s\n' "${FAILED[@]}"
exit 1
