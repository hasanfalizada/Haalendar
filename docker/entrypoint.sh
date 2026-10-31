#!/bin/sh
# +++===+++ 2026-11-01 — Hasan Alizada — HAAL-150. One image, one role per container (ADR-0004):
#   api          the HTTP API, the live stream and the web app (default)
#   worker       background jobs: reminders, data exports
#   check-worker health check of the worker (a heartbeat in the last minute)
#   migrate      the application database role (haalendar-db-bootstrap), then the migrations; exits when done
# Anything else runs as a command (e.g. `docker compose run --rm app sh`).
set -eu
case "${1:-api}" in
  api) exec haalendar-api ;;
  worker) exec haalendar-worker ;;
  check-worker) exec haalendar-worker check ;;
  migrate)
    haalendar-db-bootstrap
    cd /app/backend
    exec alembic upgrade head
    ;;
  *) exec "$@" ;;
esac
