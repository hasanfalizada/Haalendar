"""Atom calendar.day_order.v1 — Python implementation (contract: atoms/calendar.day_order.v1/contract.json).

+++===+++ 2026-10-22 — Hasan Alizada — HAAL-060. Pure function; must pass atoms/calendar.day_order.v1/vectors.json.
All-day first, then by start (a continuing entry counts as 00:00 and comes first), then by title — case and accents do
not count — then by creation time and key. Colour never takes part (the legacy colour-name order is gone).
+++===+++ 2026-11-18 16:37 +04 — Hasan Alizada — HAAL-185. Version 2 (atoms/calendar.day_order.v2, D-111): `by` is the
user's setting — "time" orders as above (the colour does not count), "color" as the legacy app: by the colour's name,
then by title (all-day and times do not count), then by creation time and key.
"""

from __future__ import annotations

import unicodedata
from dataclasses import dataclass
from typing import Literal

DayOrderBy = Literal["time", "color"]


@dataclass(frozen=True)
class DayEntry:
    key: str
    all_day: bool
    continues: bool
    start: str | None
    title: str
    color: str
    created_at: str


def title_key(title: str) -> str:
    """NFKD, combining marks (category M) removed, lower-cased."""
    decomposed = unicodedata.normalize("NFKD", title)
    return "".join(ch for ch in decomposed if not unicodedata.category(ch).startswith("M")).lower()


def _sort_key(entry: DayEntry, by: DayOrderBy) -> tuple[int, str, int, str, str, str, str]:
    ties = (title_key(entry.title), entry.title, entry.created_at, entry.key)
    if by == "color":
        return (0, entry.color, 0, *ties)
    if entry.all_day:
        return (0, "", 0, *ties)
    start = "00:00" if entry.continues else (entry.start or "00:00")
    return (1, start, 0 if entry.continues else 1, *ties)


def order(entries: list[DayEntry], by: DayOrderBy = "time") -> list[str]:
    return [entry.key for entry in sorted(entries, key=lambda entry: _sort_key(entry, by))]
