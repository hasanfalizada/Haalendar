#!/usr/bin/env bash
# +++===+++ 2026-11-01 — Hasan Alizada — HAAL-144. Secret scan with gitleaks (MIT; Docker image pinned by digest, no
# install): the whole git history and the working tree as it is now (new and changed files before they are committed;
# what git ignores is skipped, see .gitleaks.toml). Findings are printed redacted. Test data that looks like a secret
# is marked "gitleaks:allow" on its line or listed in .gitleaksignore.
# Usage: scripts/dev/secrets-scan.sh   (exit code 0 only when nothing is found)
set -uo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
IMAGE="ghcr.io/gitleaks/gitleaks:v8.30.1@sha256:c00b6bd0aeb3071cbcb79009cb16a60dd9e0a7c60e2be9ab65d25e6bc8abbb7f"
run() {
  docker run --rm -v "$ROOT:/repo:ro" -w /repo "$IMAGE" "$@" --config .gitleaks.toml --gitleaks-ignore-path .gitleaksignore \
    --redact --verbose --no-banner --log-level warn
}
status=0
echo "history:"
run git . || status=1
echo "working tree:"
run dir . || status=1
[ "$status" -eq 0 ] && echo "no secrets found"
exit "$status"
