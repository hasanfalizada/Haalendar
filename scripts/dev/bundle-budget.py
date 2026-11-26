#!/usr/bin/env python3
# +++===+++ 2026-11-26 17:20 +04 — Hasan Alizada — HAAL-143 (NFR 4.3, D-128). The budget of the JavaScript the first page
# loads: the scripts frontend/dist/index.html loads and preloads, gzip-compressed (level 6, the usual default of web
# servers), at most 300 KB. Run after the production build (part of the build step of scripts/dev/check-all.sh, so CI
# checks it too); prints each file and the total, the five largest first, and fails over the budget.
"""Usage: scripts/dev/bundle-budget.py [dist folder] (default: frontend/dist)."""

import gzip
import re
import sys
from pathlib import Path

BUDGET_KB = 300
LEVEL = 6
SCRIPT = re.compile(r'<(?:script|link)\b[^>]*?(?:src|href)="/?([^"]+\.js)"')


def main() -> int:
    root = Path(__file__).resolve().parents[2]
    dist = Path(sys.argv[1]) if len(sys.argv) > 1 else root / "frontend" / "dist"
    index = dist / "index.html"
    if not index.is_file():
        print(f"no {index}: build the frontend first (pnpm build)")
        return 2
    files = sorted(set(SCRIPT.findall(index.read_text(encoding="utf-8"))))
    if not files:
        print(f"no script in {index}")
        return 2
    sizes = {name: len(gzip.compress((dist / name).read_bytes(), LEVEL)) for name in files}
    total = sum(sizes.values()) / 1024
    for name, size in sorted(sizes.items(), key=lambda item: -item[1])[:5]:
        print(f"{size / 1024:8.1f} KB  {name}")
    print(f"initial JavaScript: {total:.1f} KB gzip in {len(files)} files (budget {BUDGET_KB} KB)")
    if total > BUDGET_KB:
        print(
            f"over the budget by {total - BUDGET_KB:.1f} KB: load what the first page does not need on demand"
        )
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
