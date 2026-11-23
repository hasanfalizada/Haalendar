"""The due date of a card or a note: a date ("YYYY-MM-DD") with an optional time ("HH:MM").

+++===+++ 2026-11-23 17:40 +04 — Hasan Alizada — HAAL-104. Shared by cards (D-92) and notes (D-121): wall-clock in the
zone of the board's or the note's owner; a date alone means the whole day; a time needs a date (clearing the date clears
the time).
"""

from __future__ import annotations

from collections.abc import Callable
from datetime import date, time
from typing import Any, Protocol

from haalendar.errors import ProblemError

DUE_FIELDS = ("due_date", "due_time")


class HasDue(Protocol):
    due_date: date | None
    due_time: time | None


def parse_date(value: Any) -> date | None:
    if value is None:
        return None
    try:
        return date.fromisoformat(str(value)) if len(str(value)) == 10 else None
    except ValueError:
        return None


def parse_time(value: Any) -> time | None:
    if value is None:
        return None
    text = str(value)
    try:
        return time.fromisoformat(text) if len(text) in (5, 8) else None
    except ValueError:
        return None


def normalize(values: dict[str, Any]) -> dict[str, Any]:
    """An incoming due time in its canonical form ("HH:MM:SS" → "HH:MM")."""
    value = values.get("due_time")
    if isinstance(value, str) and len(value) == 8 and value.endswith(":00"):
        return {**values, "due_time": value[:5]}
    return values


def state_of(row: HasDue) -> dict[str, Any]:
    return {
        "due_date": row.due_date.isoformat() if row.due_date else None,
        "due_time": row.due_time.strftime("%H:%M") if row.due_time else None,
    }


def apply(row: HasDue, values: dict[str, Any], problem: Callable[[str, str], ProblemError]) -> None:
    """Writes the due fields given (checked); a date cleared takes the time along."""
    for name, value in values.items():
        if name == "due_date":
            due = parse_date(value)
            if value is not None and due is None:
                raise problem("due_date", "Use a date as YYYY-MM-DD")
            row.due_date = due
            if due is None:
                row.due_time = None
        elif name == "due_time":
            at = parse_time(value)
            if value is not None and at is None:
                raise problem("due_time", "Use a time as HH:MM")
            row.due_time = at
    if row.due_time is not None and row.due_date is None:
        raise problem("due_time", "A time needs a date")
