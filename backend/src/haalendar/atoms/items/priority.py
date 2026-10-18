"""Atom items.priority.v1 (contract: atoms/items.priority.v1/contract.json; FR-X-12, D-04, D-46).

+++===+++ 2026-10-17 — Hasan Alizada — HAAL-041. Default, order and filter of item priorities. `rank_sql` gives the
same order to SQL, so list endpoints sort in the database exactly as the web app sorts locally.
"""

from __future__ import annotations

from collections.abc import Iterable, Sequence
from dataclasses import dataclass
from typing import Literal

from sqlalchemy import ColumnElement, case
from sqlalchemy.orm import QueryableAttribute

Column = ColumnElement[str] | QueryableAttribute[str]

Priority = Literal["low", "medium", "high"]
DEFAULT: Priority = "medium"
RANK: dict[str, int] = {"high": 3, "medium": 2, "low": 1}


def normalize(value: str | None) -> Priority:
    if value is None:
        return DEFAULT
    if value not in RANK:
        raise ValueError(f"unknown priority: {value!r}")
    return value  # type: ignore[return-value]  # checked against RANK above


@dataclass(frozen=True, slots=True)
class Ranked:
    id: str
    priority: str | None
    tiebreak: str | float


def sort(items: Iterable[Ranked]) -> list[str]:
    """Ids ordered high → low, then by tiebreak ascending, then by id."""
    ordered = sorted(items, key=lambda i: (-RANK[normalize(i.priority)], i.tiebreak, i.id))
    return [i.id for i in ordered]


def filter_ids(items: Iterable[Ranked], allowed: Sequence[str]) -> list[str]:
    """Ids whose priority is in `allowed` (empty = all), in their original order."""
    wanted = {normalize(p) for p in allowed}
    return [i.id for i in items if not wanted or normalize(i.priority) in wanted]


def rank_sql(column: Column) -> ColumnElement[int]:
    """SQL rank for ORDER BY (descending = high first); NULL counts as medium."""
    return case(RANK, value=column, else_=RANK[DEFAULT])


def filter_sql(column: Column, allowed: Sequence[str]) -> ColumnElement[bool] | None:
    """SQL condition for a priority filter (None = no filter: the empty set keeps everything)."""
    wanted = sorted({normalize(p) for p in allowed})
    if not wanted:
        return None
    condition = column.in_(wanted)
    return (condition | column.is_(None)) if DEFAULT in wanted else condition
