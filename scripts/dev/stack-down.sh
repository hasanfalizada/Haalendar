#!/usr/bin/env bash
# +++===+++ 2026-10-28 CET — Hasan Alizada — Stops the stack of stack-up.sh: the sessions recorded in
# <repo>/.dev/sessions (API, worker, Vite and their children), the throw-away database container and the
# uploads/mail in <repo>/.dev (service data only). Sessions instead of name patterns: a pattern
# can match unrelated shells whose command line merely mentions it.
set -uo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
SESSIONS="$ROOT/.dev/sessions"
if [ -f "$SESSIONS" ]; then
  while read -r sid; do [ -n "$sid" ] && pkill -TERM -s "$sid"; done <"$SESSIONS"
  sleep 2
  while read -r sid; do [ -n "$sid" ] && pkill -KILL -s "$sid"; done <"$SESSIONS"
  rm -f "$SESSIONS"
fi
docker rm -f haalendar-dev-db >/dev/null 2>&1
# physical-delete-allowed: throw-away dev stack data (uploads, outgoing mail) — no user content
rm -rf "$ROOT/.dev/storage" "$ROOT/.dev/mail"
for port in 8081 5173 4173; do
  ss -ltn "sport = :$port" | grep -q LISTEN && echo "port $port still in use" || echo "port $port free"
done
docker ps -q --filter name=haalendar-dev-db | grep -q . && echo "database still running" || echo "database removed"
