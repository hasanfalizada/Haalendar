"""Atom calendar.iso_week.v1 — Python implementation (contract: atoms/calendar.iso_week.v1/contract.json).

+++===+++ 2026-10-23 — Hasan Alizada — HAAL-062. Pure function; must pass atoms/calendar.iso_week.v1/vectors.json.
ISO 8601 weeks (Monday first, week 1 holds the first Thursday) of the given date — never of today.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date


@dataclass(frozen=True)
class IsoWeek:
    week: int
    week_year: int


def iso_week(day: date) -> IsoWeek:
    week_year, week, _ = day.isocalendar()
    return IsoWeek(week=week, week_year=week_year)
