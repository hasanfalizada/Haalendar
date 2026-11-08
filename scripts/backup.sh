#!/usr/bin/env bash
# +++===+++ 2026-11-09 — Hasan Alizada — HAAL-155. Backs up a Haalendar installation while it runs: the database (pg_dump,
# a consistent snapshot), then the files of the `data` volume, and .env (HAALENDAR_SECRET_KEY decrypts 2FA and Web Push
# secrets in the database, so a backup without it is not enough). In that order every attachment in the dump has its file.
# Nothing leaves this host: copy the backups elsewhere yourself. They hold passwords and all user data: encrypt them there.
#
# Run from the installation directory (with compose.yaml and .env):  ./backup.sh
# Every night at 03:00 (crontab -e):  0 3 * * * cd /opt/haalendar && ./backup.sh
# Settings, from the environment or .env: HAALENDAR_BACKUP_DIR (default ./backups), HAALENDAR_BACKUP_KEEP (default 14).
# The exit code is 0 only when a complete, readable backup was written.
set -euo pipefail
umask 077
# Only errors: from cron whatever is printed arrives as mail.
export COMPOSE_PROGRESS=quiet

die() { echo "backup failed: $*" >&2; exit 1; }
[ -f compose.yaml ] && [ -f .env ] || die "run it from the installation directory (compose.yaml and .env)"
setting() { sed -n "s/^$1=//p" .env | tail -1 | tr -d '"'; }
DIR=${HAALENDAR_BACKUP_DIR:-$(setting HAALENDAR_BACKUP_DIR)}
DIR=${DIR:-./backups}
KEEP=${HAALENDAR_BACKUP_KEEP:-$(setting HAALENDAR_BACKUP_KEEP)}
KEEP=${KEEP:-14}
case "$KEEP" in '' | *[!0-9]* | 0) die "HAALENDAR_BACKUP_KEEP must be a number above 0" ;; esac

NAME=haalendar-$(date -u +%Y%m%dT%H%M%SZ)
WORK=$DIR/.incomplete-$NAME
# physical-delete-allowed: an unfinished backup of this run, not user content
trap 'rm -rf "$WORK"' EXIT
mkdir -p "$WORK"

docker compose exec -T db pg_isready -U haalendar -d haalendar -q || die "the database is not running"
docker compose exec -T db pg_dump -U haalendar -d haalendar -Fc >"$WORK/db.dump" || die "pg_dump"

# tar answers 1 when a file changed while it was read (an export being written): the rest of the archive is good.
status=0
docker compose run --rm --no-deps -T app tar -C /data -cf - . >"$WORK/files.tar" 2>"$WORK/tar.log" || status=$?
[ "$status" -le 1 ] || { cat "$WORK/tar.log" >&2; die "reading the data volume"; }
rm -f "$WORK/tar.log"

cp .env "$WORK/env"
REVISION=$(docker compose exec -T db psql -U haalendar -d haalendar -Atc 'SELECT version_num FROM alembic_version') ||
  die "the database has no migrations: the installation never started"
{
  echo "created_utc=${NAME#haalendar-}"
  echo "image=$(setting HAALENDAR_IMAGE)"
  echo "revision=$REVISION"
} >"$WORK/info.txt"

# A backup that cannot be read is found out now, not on the day it is needed.
docker compose exec -T db pg_restore --list <"$WORK/db.dump" >/dev/null || die "the dump cannot be read"
tar -tf "$WORK/files.tar" >/dev/null || die "the files archive cannot be read"
(cd "$WORK" && sha256sum db.dump files.tar env info.txt >SHA256SUMS)

mv "$WORK" "$DIR/$NAME"
trap - EXIT
echo "backup written: $DIR/$NAME ($(du -sh "$DIR/$NAME" | cut -f1))"

# Only complete backups count, newest first. physical-delete-allowed: old backups by HAALENDAR_BACKUP_KEEP (D-102).
find "$DIR" -mindepth 1 -maxdepth 1 -type d -name 'haalendar-*' | sort -r | tail -n +"$((KEEP + 1))" | while read -r old; do
  rm -rf "$old"
  echo "old backup removed: $old"
done
