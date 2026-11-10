"""Haalendar backend package.

+++===+++ 2026-10-14 — Hasan Alizada — HAAL-016. Package root; version is read by the health endpoint and logs.
+++===+++ 2026-10-15 — Hasan Alizada — HAAL-169. Time zone rules come only from the pinned `tzdata` package, never from
the host (/usr/share/zoneinfo may be missing in slim images or older than the pinned release), so every machine
computes the same instants. This runs before any ZoneInfo is created.
"""

import os
import zoneinfo

zoneinfo.reset_tzpath(to=[])

# +++===+++ 2026-11-09 — Hasan Alizada — HAAL-154. An image knows its release (Dockerfile, set by CI from the tag), so the
# health endpoints and logs name what really runs; seen on the demo stand: 1.0.0-rc.3 answered 0.1.0.
__version__ = os.environ.get("HAALENDAR_VERSION") or "0.1.0"
