#!/usr/bin/env bash
# +++===+++ 2026-11-08 — Hasan Alizada — HAAL-152. Takes the README's screenshots again (docs/screenshots) from the real
# app on the throw-away stack with made-up data (e2e/screenshots). The stack starts and stops with the run; move the
# API's port when it is taken: STACK_API_PORT=8091 scripts/dev/screenshots.sh
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"
export PATH="$HOME/.local/bin:$PATH"
# shellcheck disable=SC1091
[ -s "$HOME/.nvm/nvm.sh" ] && . "$HOME/.nvm/nvm.sh" >/dev/null
pnpm --filter haalendar-e2e exec playwright test --config screenshots.config.ts
