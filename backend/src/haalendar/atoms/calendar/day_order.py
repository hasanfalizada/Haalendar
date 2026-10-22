"""Atom calendar.day_order.v1 — Python implementation (contract: atoms/calendar.day_order.v1/contract.json).

+++===+++ 2026-10-22 — Hasan Alizada — HAAL-060. Pure function; must pass atoms/calendar.day_order.v1/vectors.json.
All-day first, then by start (a continuing entry counts as 00:00 and comes first), then by title — case and accents do
not count — then by creation time and key. Colour never takes part (the legacy colour-name order is gone).
"""

from __future__ import annotations

import unicodedata
from dataclasses import dataclass


@dataclass(frozen=True)
class DayEntry:
    key: str
    all_day: bool
    continues: bool
    start: str | None
    title: str
    created_at: str


def title_key(title: str) -> str:
    """NFKD, combining marks (category M) removed, lower-cased."""
    decomposed = unicodedata.normalize("NFKD", title)
    return "".join(ch for ch in decomposed if not unicodedata.category(ch).startswith("M")).lower()


def _sort_key(entry: DayEntry) -> tuple[int, str, int, str, str, str, str]:
    ties = (title_key(entry.title), entry.title, entry.created_at, entry.key)
    if entry.all_day:
        return (0, "", 0, *ties)
    start = "00:00" if entry.continues else (entry.start or "00:00")
    return (1, start, 0 if entry.continues else 1, *ties)


def order(entries: list[DayEntry]) -> list[str]:
    return [entry.key for entry in sorted(entries, key=_sort_key)]
