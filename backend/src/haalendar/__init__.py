"""Haalendar backend package.

+++===+++ 2026-10-14 — Hasan Alizada — HAAL-016. Package root; version is read by the health endpoint and logs.
+++===+++ 2026-10-15 — Hasan Alizada — HAAL-169. Time zone rules come only from the pinned `tzdata` package, never from
the host (/usr/share/zoneinfo may be missing in slim images or older than the pinned release), so every machine
computes the same instants. This runs before any ZoneInfo is created.
"""

import zoneinfo

zoneinfo.reset_tzpath(to=[])

__version__ = "0.1.0"
