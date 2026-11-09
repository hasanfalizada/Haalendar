#!/usr/bin/env bash
# +++===+++ 2026-11-01 — Hasan Alizada — HAAL-150. Checks the production installation (compose.yaml) end to end: builds
# the image, starts db, migrate, app, worker and the bundled Caddy in their own Compose project (ports on loopback
# only, random secrets, the setup token required), runs the whole end-to-end suite against the app (desktop and
# offline), stops and starts the stack to see the data survive, checks HTTPS through Caddy, then removes the project
# with its volumes. Throw-away data only.
# +++===+++ 2026-11-09 — Hasan Alizada — HAAL-155. Backup and restore too (scripts/backup.sh, scripts/restore.sh).
# +++===+++ 2026-11-09 — Hasan Alizada — HAAL-154. The demo too (compose.demo.yaml): it refuses a real installation, then on
# an empty one it fills in its accounts and a reset removes what a visitor did.
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
  # +++===+++ 2026-11-09 — Hasan Alizada — HAAL-155. The backup check removes .env; Compose needs it to find the project.
  [ -f "$DIR/.env" ] || [ ! -f "$DIR/env.kept" ] || cp "$DIR/env.kept" "$DIR/.env"
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
cp "$ROOT/compose.yaml" "$ROOT/compose.demo.yaml" "$ROOT/Caddyfile" "$DIR/"
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

# +++===+++ 2026-11-09 — Hasan Alizada — HAAL-155. Backup and restore as the guide tells: the data the suite left, a backup
# of the running installation, the volumes and .env gone as on a lost server, a restore, and everything back: rows,
# files, the key that decrypts secrets in the database (2FA uses the same key), signing in. Plus what must be refused.
echo "== backup and restore"
cp "$ROOT/scripts/backup.sh" "$ROOT/scripts/restore.sh" "$DIR/"
cp "$DIR/.env" "$DIR/env.kept"
inst() { env -C "$DIR" COMPOSE_PROJECT_NAME="$PROJECT" "$@"; }
rows() {
  dc exec -T db psql -U haalendar -d haalendar -Atc "SELECT (SELECT count(*) FROM user_account), (SELECT count(*) FROM item), \
    (SELECT count(*) FROM attachment), (SELECT count(*) FROM board), (SELECT max(id::text) FROM item), (SELECT version_num FROM alembic_version)"
}
files() { dc run --rm --no-deps -T app sh -c 'cd /data && find . -type f -exec sha256sum {} + | sort'; }
push_key() {
  dc run --rm --no-deps -T app python - <<'PY' | sed -n 's/^KEY=//p'
import asyncio

from haalendar.config import load_settings
from haalendar.db import create_engine, create_session_factory
from haalendar.push.service import keys


async def main() -> None:
    settings = load_settings()
    async with create_session_factory(create_engine(settings))() as db:
        public, _private = await keys(db, settings)
        await db.commit()
    print(f"KEY={public}")


asyncio.run(main())
PY
}
# The suite uploads nothing, so an attachment is added here. Through HTTPS: the session cookie is Secure.
JAR="$DIR/cookies"
ATTACHMENT=""
upload() {
  local csrf item answer
  local login='{"email":"admin@example.com","password":"quiet-mountain-river-42"}' # gitleaks:allow — e2e/users.ts
  csrf=$(curl -ksSf -c "$JAR" -H 'Content-Type: application/json' -H "Origin: $HTTPS" "$HTTPS/api/v1/auth/login" \
    -d "$login" | python3 -c 'import json,sys; print(json.load(sys.stdin)["csrf_token"])') || return 1
  item=$(dc exec -T db psql -U haalendar -d haalendar -Atc "SELECT id FROM item WHERE deleted_at IS NULL LIMIT 1")
  answer=$(curl -ksSf -b "$JAR" -H "Origin: $HTTPS" -H "X-CSRF-Token: $csrf" -H 'Content-Type: image/png' -H 'X-File-Name: probe.png' \
    --data-binary @"$ROOT/branding/icon-192.png" "$HTTPS/api/v1/items/$item/attachments") || return 1
  ATTACHMENT=$(echo "$answer" | python3 -c 'import json,sys; print(json.load(sys.stdin)["id"])')
}
check "an attachment to back up" upload
download() { curl -ksSf -b "$JAR" "$HTTPS/api/v1/attachments/$ATTACHMENT" | sha256sum; }
ROWS=$(rows); FILES=$(files); KEY=$(push_key); PICTURE=$(download)
has_data() {
  local failed=0
  [ -n "$KEY" ] || { echo "   no Web Push key"; failed=1; }
  echo "$ROWS" | awk -F'|' '{exit !($1 > 0 && $2 > 0 && $3 > 0)}' || { echo "   rows: $ROWS"; failed=1; }
  echo "$FILES" | grep -q '[0-9a-f]\{64\}' || { echo "   no files"; failed=1; }
  # The hash of nothing: a failed download would otherwise equal a failed download after the restore.
  case "$PICTURE" in "" | e3b0c44298fc*) echo "   the attachment did not download"; failed=1 ;; esac
  return "$failed"
}
check "there is data to back up (users, items, attachments, files, the Web Push key)" has_data
same() { [ "$1" = "$2" ] || { echo "   before: $1"; echo "   after:  $2"; return 1; }; }
newest() { find "$DIR/backups" -mindepth 1 -maxdepth 1 -type d -name 'haalendar-*' | sort | tail -1; }
check "backup of the running installation" inst ./backup.sh
BACKUP=$(newest)
check "the backup is private" sh -c "[ \"\$(stat -c %a '$BACKUP')\" = 700 ] && [ \"\$(stat -c %a '$BACKUP/env')\" = 600 ]"
kept() {
  sleep 1 && inst ./backup.sh >/dev/null && sleep 1 && inst env HAALENDAR_BACKUP_KEEP=2 ./backup.sh >/dev/null &&
    [ "$(find "$DIR/backups" -mindepth 1 -maxdepth 1 -type d | wc -l)" = 2 ]
}
check "only the newest backups are kept" kept
BACKUP=$(newest)
refused() { if inst "$@" >/dev/null 2>&1 </dev/null; then echo "   not refused: $*"; return 1; fi; }
check "restore asks first" refused ./restore.sh "$BACKUP"
cp -r "$BACKUP" "$DIR/damaged"
echo x >>"$DIR/damaged/files.tar"
check "a damaged backup is refused" refused ./restore.sh "$DIR/damaged" --yes
sed -i 's/^HAALENDAR_SECRET_KEY=.*/HAALENDAR_SECRET_KEY=another/' "$DIR/.env"
check "another secret key is refused" refused ./restore.sh "$BACKUP" --yes
cp "$DIR/env.kept" "$DIR/.env"
sed -i 's|^HAALENDAR_PUBLIC_URL=.*|HAALENDAR_PUBLIC_URL=http://not-https|' "$DIR/.env"
check "settings the app would refuse are refused first" refused ./restore.sh "$BACKUP" --yes
cp "$DIR/env.kept" "$DIR/.env"
check "what was refused changed nothing" ready
check "what was refused changed no rows" same "$ROWS" "$(rows)"
dc down -v --remove-orphans >/dev/null 2>&1
rm -f "$DIR/.env" # physical-delete-allowed: throw-away installation, as if the server was lost
check "restore on an empty installation, .env from the backup" inst ./restore.sh "$BACKUP" --yes
check "healthy after the restore" healthy
check "ready after the restore, row-level security enforced" ready
check "the same rows" same "$ROWS" "$(rows)"
check "the same files" same "$FILES" "$(files)"
check "the secrets in the database still decrypt" same "$KEY" "$(push_key)"
dc up -d >/dev/null 2>&1
check "healthy with the proxy" healthy
https_ready() { curl -ksSf "$HTTPS/api/v1/health/ready" 2>/dev/null | grep -q '"status":"ready"'; }
for _ in $(seq 1 20); do https_ready && break; sleep 2; done
check "the attachment downloads as before, the session still valid" same "$PICTURE" "$(download)"
check "signing in after the restore" env -C "$ROOT/e2e" E2E_BASE_URL="$APP" E2E_OFFLINE_URL="$APP" \
  npx playwright test tests/auth.spec.ts --project=desktop --reporter=dot

# +++===+++ 2026-11-09 — Hasan Alizada — HAAL-154. The demo.
demo() { dc -f "$DIR/compose.yaml" -f "$DIR/compose.demo.yaml" -f "$DIR/compose.override.yaml" "$@"; }
demo_refuses() { ! demo run --rm --no-deps demo >/dev/null 2>&1; }
ROWS=$(rows)
check "the demo refuses a real installation" demo_refuses
check "and that changed no rows" same "$ROWS" "$(rows)"
dc down -v >/dev/null 2>&1
demo up -d >/dev/null 2>&1
demo_api() { curl -ksS -b "$DIR/demo.cookies" -c "$DIR/demo.cookies" "$@"; }
demo_login() {
  local status
  status=$(demo_api -o /dev/null -w '%{http_code}' "$HTTPS/api/v1/auth/login" -H 'Content-Type: application/json' \
    --data "$(curl -ksS "$HTTPS/api/v1/demo/status" | python3 -I -c 'import json,sys; a=json.load(sys.stdin)["accounts"][0]; print(json.dumps({"email":a["email"],"password":a["password"]}))')")
  [ "$status" = 200 ]
}
for _ in $(seq 1 60); do demo_login && break; sleep 2; done
check "the demo accounts sign in" demo_login
check "the demo has its data" sh -c "curl -ksS -b '$DIR/demo.cookies' $HTTPS/api/v1/sync/pull | grep -q Groceries"
csrf() { demo_api "$HTTPS/api/v1/me" | python3 -I -c 'import json,sys; print(json.load(sys.stdin)["csrf_token"])'; }
visitor_note() {
  local id; id=$(python3 -I -c 'import uuid; print(uuid.uuid4())')
  demo_api "$HTTPS/api/v1/sync/push" -H 'Content-Type: application/json' -H "X-CSRF-Token: $(csrf)" --data \
    '{"mutations":[{"mutation_id":"'"$(python3 -I -c 'import uuid; print(uuid.uuid4())')"'","entity_type":"item","entity_id":"'"$id"'","op":"create","data":{"kind":"note","container_kind":"note","title":"Left by a visitor","body":"","color":"blue","position":"z000"}}]}' \
    | grep -q '"applied"'
}
check "a visitor writes a note" visitor_note
check "a password cannot be changed" sh -c "[ \"\$(curl -ksS -o /dev/null -w '%{http_code}' -X POST $HTTPS/api/v1/me/password -H 'Content-Type: application/json' -d '{}')\" = 403 ]"
RESET_LINES=$(demo logs demo 2>/dev/null | grep -c demo_reset_done)
demo restart demo >/dev/null 2>&1
for _ in $(seq 1 60); do
  [ "$(demo logs demo 2>/dev/null | grep -c demo_reset_done)" -gt "$RESET_LINES" ] && break
  sleep 2
done
check "a reset signs the visitor out" sh -c "[ \"\$(curl -ksS -b '$DIR/demo.cookies' -o /dev/null -w '%{http_code}' $HTTPS/api/v1/me)\" = 401 ]"
rm -f "$DIR/demo.cookies"  # physical-delete-allowed: the cookie of this check
for _ in $(seq 1 20); do demo_login && break; sleep 2; done
check "and removes the note" sh -c "! curl -ksS -b '$DIR/demo.cookies' $HTTPS/api/v1/sync/pull | grep -q 'Left by a visitor'"
check "the data is back" sh -c "curl -ksS -b '$DIR/demo.cookies' $HTTPS/api/v1/sync/pull | grep -q Groceries"
sleep 45
check "the worker is back after the reset" sh -c "docker inspect \"\$(docker compose -p '$PROJECT' --project-directory '$DIR' ps -q worker)\" --format '{{.State.Health.Status}}' | grep -q healthy"
demo down -v --remove-orphans >/dev/null 2>&1

if [ ${#FAILED[@]} -eq 0 ]; then echo "compose check: all passed"; exit 0; fi
printf 'compose check FAILED: %s\n' "${FAILED[@]}"
exit 1
