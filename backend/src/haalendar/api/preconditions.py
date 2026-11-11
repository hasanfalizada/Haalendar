"""Optimistic concurrency preconditions shared by all routers (ADR-0007: If-Match carries the resource version).

+++===+++ 2026-10-15 — Hasan Alizada — HAAL-167. Extracted from the accounts API (HAAL-164) for reuse by sharing.
"""

from __future__ import annotations

import re

from haalendar.errors import ProblemCode, ProblemError

IF_MATCH = re.compile(r'^"(\d+)"$')


def expected_version(if_match: str | None) -> int:
    """Version from a strong ETag like "7": missing → 428 precondition_required, malformed → 400."""
    if if_match is None:
        raise ProblemError(428, ProblemCode.PRECONDITION_REQUIRED, "Send the current version in If-Match")
    found = IF_MATCH.match(if_match.strip())
    if found is None:
        raise ProblemError(400, ProblemCode.BAD_REQUEST, 'If-Match must look like "7"')
    return int(found.group(1))
