#!/usr/bin/env bash
# +++===+++ 2026-11-09 — Hasan Alizada — HAAL-155. Restores a backup of scripts/backup.sh into this installation, also on a
# new server: everything now in the database and the `data` volume is REPLACED by the backup, so it asks first. A newer
# image migrates the restored database when the app starts; devices sync again from the start by themselves.
#
# Run from the installation directory (with compose.yaml; .env comes from the backup if there is none):
#   ./restore.sh backups/haalendar-20270101T030000Z        (--yes: without asking)
set -euo pipefail
umask 077
# Only errors: from cron whatever is printed arrives as mail.
export COMPOSE_PROGRESS=quiet

die() { echo "restore failed: $*" >&2; exit 1; }
BACKUP=""
YES=0
for arg in "$@"; do
  case "$arg" in
    --yes) YES=1 ;;
    -*) die "unknown option: $arg (--yes)" ;;
    *) BACKUP=$arg ;;
  esac
done
[ -n "$BACKUP" ] || die "name the backup: ./restore.sh backups/haalendar-…"
[ -f compose.yaml ] || die "run it from the installation directory (compose.yaml)"
[ -f "$BACKUP/SHA256SUMS" ] || die "$BACKUP is not a backup: it has no SHA256SUMS"
(cd "$BACKUP" && sha256sum --quiet -c SHA256SUMS) || die "the backup is damaged: its checksums do not match"

setting() { sed -n "s/^$2=//p" "$1" | tail -1 | tr -d '"'; }
if [ ! -f .env ]; then
  cp "$BACKUP/env" .env
  echo ".env taken from the backup"
elif [ "$(setting .env HAALENDAR_SECRET_KEY)" != "$(setting "$BACKUP/env" HAALENDAR_SECRET_KEY)" ]; then
  # With another key two-factor sign-in and Web Push of the restored data would stop working.
  die "HAALENDAR_SECRET_KEY in .env is not the backup's: put the backup's in .env, or use $BACKUP/env as .env, and run this again"
fi

cat "$BACKUP/info.txt"
if [ "$YES" -ne 1 ]; then
  [ -t 0 ] || die "nothing restored: add --yes when there is no terminal to ask on"
  echo "This REPLACES all data of this installation with the backup $BACKUP."
  printf 'Type restore to go on: '
  read -r answer
  [ "$answer" = restore ] || die "nothing restored"
fi

# Settings the app would refuse are found now, while everything is still in place.
if ! answer=$(docker compose run --rm --no-deps -T app python -c 'from haalendar.config import load_settings; load_settings()' 2>&1); then
  echo "$answer" | tail -3 >&2
  die "the app refuses the settings in .env; nothing was changed"
fi

START=$SECONDS
docker compose stop app worker >/dev/null 2>&1 || true
docker compose up -d --wait db

# The database's password is in .env; a database volume that already exists keeps the one it was created with.
PASSWORD=$(setting .env POSTGRES_PASSWORD)
db_sql() { docker compose exec -T db psql -U haalendar -d postgres -v ON_ERROR_STOP=1 -q; }
printf "ALTER ROLE haalendar WITH PASSWORD '%s';\n" "$PASSWORD" | db_sql
# From here on a failure leaves the installation without its data; the backup is untouched.
trap '[ $? -eq 0 ] || echo "restore did not finish: fix the cause and run it again with the same backup" >&2' EXIT
# physical-delete-allowed: the owner asked for this data to be replaced by the backup (FR-OPS-04)
echo 'DROP DATABASE IF EXISTS haalendar WITH (FORCE); CREATE DATABASE haalendar OWNER haalendar;' | db_sql
# The application role is not in a dump, and the dump grants it its rights.
docker compose run --rm --no-deps -T migrate haalendar-db-bootstrap >/dev/null
docker compose exec -T db pg_restore -U haalendar -d haalendar --exit-on-error --single-transaction <"$BACKUP/db.dump"

# physical-delete-allowed: the owner asked for this data to be replaced by the backup (FR-OPS-04)
docker compose run --rm --no-deps -T app sh -c 'find /data -mindepth 1 -delete && tar -C /data -xf -' <"$BACKUP/files.tar"

docker compose up -d
for _ in $(seq 1 100); do
  case "$(docker compose ps --format '{{.Service}}={{.Health}}' app)" in *app=healthy*) break ;; esac
  sleep 3
done
case "$(docker compose ps --format '{{.Service}}={{.Health}}' app)" in
  *app=healthy*) ;;
  *) docker compose logs --tail 30 migrate app >&2; die "the data is restored but the app did not become healthy" ;;
esac
echo "restored in $((SECONDS - START)) s. With the bundled proxy, start it too: docker compose --profile proxy up -d"
