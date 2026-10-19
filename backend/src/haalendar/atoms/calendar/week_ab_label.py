"""Atom calendar.week_ab_label.v1 — Python implementation (contract: atoms/calendar.week_ab_label.v1/contract.json).

+++===+++ 2026-10-19 — Hasan Alizada — HAAL-045. Pure function; must pass atoms/calendar.week_ab_label.v1/vectors.json.
Weeks are cut by the user's week start and counted from the anchor week, so the label is right across year
boundaries and 53-week years; ISO week number parity is never used.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date, timedelta


class LabelsNotDistinctError(ValueError):
    """Contract error LABELS_NOT_DISTINCT: the two labels are equal (case-insensitive)."""

    code = "LABELS_NOT_DISTINCT"


@dataclass(frozen=True)
class WeekLabel:
    label: str
    index: int
    weeks_from_anchor: int


def week_start_of(day: date, week_start: int) -> date:
    """The latest day on or before `day` whose weekday is `week_start` (0 = Sunday … 6 = Saturday)."""
    if not 0 <= week_start <= 6:
        raise ValueError("week_start must be 0..6")
    sunday_based = (day.weekday() + 1) % 7  # Python: Monday = 0 → contract: Sunday = 0
    return day - timedelta(days=(sunday_based - week_start) % 7)


def label_week(*, day: date, anchor: date, week_start: int, labels: tuple[str, str]) -> WeekLabel:
    if labels[0].casefold() == labels[1].casefold():
        raise LabelsNotDistinctError("labels must differ")
    weeks = (week_start_of(day, week_start) - week_start_of(anchor, week_start)).days // 7
    index = weeks % 2  # Python's modulo is non-negative for a positive divisor
    return WeekLabel(label=labels[index], index=index, weeks_from_anchor=weeks)
