#!/usr/bin/env bash
# +++===+++ 2026-11-01 — Hasan Alizada — HAAL-145. Exit 0 when nothing listens on any of the given TCP ports of this
# host; otherwise names each busy port with its process (when visible) and exits 1. stack-up.sh asks it first, so the
# throw-away stack never talks to another program on its port (another project's dev server answered on 8081).
# Usage: scripts/dev/ports-free.sh 8081 5173 ...
set -uo pipefail
busy=0
for port in "$@"; do
  line=$(ss -ltnpH "sport = :$port" 2>/dev/null | head -1)
  if [ -n "$line" ]; then
    proc=$(echo "$line" | grep -o 'users:(([^)]*' | sed 's/users:((//')
    echo "port $port is in use${proc:+ by $proc}"
    busy=1
  fi
done
exit "$busy"
