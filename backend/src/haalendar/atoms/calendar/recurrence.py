"""Atom calendar.recurrence.v1 — Python implementation (contract: atoms/calendar.recurrence.v1/contract.json).

+++===+++ 2026-10-22 — Hasan Alizada — HAAL-066. Pure function; must pass atoms/calendar.recurrence.v1/vectors.json.
Dates only (FR-CAL-10): daily, weekly (weekday of the start), monthly (day of month; months without it are skipped),
yearly (29 February only in leap years). The first candidate is computed directly, so a series started years ago costs
no more than one inside the window.
"""

from __future__ import annotations

import calendar
from collections.abc import Iterable
from datetime import date, timedelta

SUPPORTED_RRULES = frozenset({"FREQ=DAILY", "FREQ=WEEKLY", "FREQ=MONTHLY", "FREQ=YEARLY"})
MAX_WINDOW_DAYS = 366


class RecurrenceError(ValueError):
    code = ""


class UnsupportedRruleError(RecurrenceError):
    """Contract error UNSUPPORTED_RRULE."""

    code = "UNSUPPORTED_RRULE"


class InvalidWindowError(RecurrenceError):
    """Contract error INVALID_WINDOW."""

    code = "INVALID_WINDOW"


class WindowTooLargeError(RecurrenceError):
    """Contract error WINDOW_TOO_LARGE."""

    code = "WINDOW_TOO_LARGE"


def is_supported(rrule: str | None) -> bool:
    return rrule is None or rrule in SUPPORTED_RRULES


def _months(first: date, last: date) -> Iterable[tuple[int, int]]:
    year, month = first.year, first.month
    while (year, month) <= (last.year, last.month):
        yield year, month
        year, month = (year + 1, 1) if month == 12 else (year, month + 1)


def _candidates(start: date, rrule: str | None, first: date, last: date) -> Iterable[date]:
    if rrule is None:
        yield start
    elif rrule == "FREQ=DAILY":
        day = first
        while day <= last:
            yield day
            day += timedelta(days=1)
    elif rrule == "FREQ=WEEKLY":
        day = first + timedelta(days=(start - first).days % 7)  # the next date on the start's weekday
        while day <= last:
            yield day
            day += timedelta(days=7)
    elif rrule == "FREQ=MONTHLY":
        for year, month in _months(first, last):
            if start.day <= calendar.monthrange(year, month)[1]:
                yield date(year, month, start.day)
    else:  # FREQ=YEARLY
        for year in range(first.year, last.year + 1):
            if start.month == 2 and start.day == 29 and not calendar.isleap(year):
                continue
            yield date(year, start.month, start.day)


def occurrences(
    *, start_date: date, rrule: str | None, exceptions: Iterable[date], window_from: date, window_to: date
) -> list[date]:
    """Occurrence dates inside [window_from, window_to], ascending, without exceptions."""
    if not is_supported(rrule):
        raise UnsupportedRruleError("unsupported RRULE")
    if window_to < window_from:
        raise InvalidWindowError("window ends before it starts")
    if (window_to - window_from).days > MAX_WINDOW_DAYS:
        raise WindowTooLargeError("window longer than 367 days")
    first = max(start_date, window_from)
    if first > window_to:
        return []
    skipped = set(exceptions)
    return [
        day
        for day in _candidates(start_date, rrule, first, window_to)
        if first <= day <= window_to and day not in skipped
    ]
