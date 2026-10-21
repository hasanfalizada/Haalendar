"""Sync cursor (ADR-0009, D-56): the last number handed out plus the transactions still in progress at that moment.

+++===+++ 2026-10-21 — Hasan Alizada — HAAL-053. Opaque to the client: base64url of a small JSON with a format version.
Anything that does not decode to the current format is answered with 410 (start over with a full sync).
"""

from __future__ import annotations

import base64
import json
from dataclasses import dataclass, field

from haalendar.errors import ProblemCode, ProblemError

FORMAT = 1
MAX_LENGTH = 4096


@dataclass(frozen=True)
class Cursor:
    seq: int = 0
    xip: tuple[int, ...] = field(default_factory=tuple)


def encode(cursor: Cursor) -> str:
    raw = json.dumps({"v": FORMAT, "seq": cursor.seq, "xip": list(cursor.xip)}, separators=(",", ":"))
    return base64.urlsafe_b64encode(raw.encode()).decode().rstrip("=")


def decode(text: str | None) -> Cursor:
    """The cursor of `text`; no text means the start (full sync)."""
    if not text:
        return Cursor()
    try:
        if len(text) > MAX_LENGTH:
            raise ValueError("too long")
        data = json.loads(base64.urlsafe_b64decode(text + "=" * (-len(text) % 4)))
        if data["v"] != FORMAT:
            raise ValueError("format")
        seq = int(data["seq"])
        xip = tuple(int(x) for x in data["xip"])
        if seq < 0 or any(x <= 0 for x in xip):
            raise ValueError("range")
    except (ValueError, KeyError, TypeError) as exc:
        raise ProblemError(
            410, ProblemCode.CURSOR_INVALID, "The sync position is no longer valid; start a full sync"
        ) from exc
    return Cursor(seq=seq, xip=xip)
