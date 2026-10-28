"""When reminders fire (FR-CAL-29, owner decision D-79) — pure functions, no database.

+++===+++ 2026-10-28 — Hasan Alizada — HAAL-091.
- Two forms of a reminder. "Before": `offset_minutes` before the start of an occurrence — a timed event starts at its
  wall-clock time in its own zone, an all-day event at 00:00 of its date in the owner's zone. "On the day": at
  `all_day_time` (owner's zone) `all_day_days_before` days before the occurrence's date. Both forms work for both kinds
  of event, so an event that changes between all-day and timed keeps sensible reminders.
- The next fire: the first occurrence after the one that fired last whose fire time is not before `not_before`
  (the moment of the check). A reminder whose time has already passed when it is set or changed does not fire for
  that occurrence; one missed while the server was down fires once, late, and the rest of the missed ones are skipped.
- Series: occurrences from the recurrence atom without the excluded dates, searched a few windows ahead.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime, time, timedelta

from haalendar.atoms.calendar.recurrence import MAX_WINDOW_DAYS, occurrences
from haalendar.atoms.time.local_to_utc import local_to_utc

# How far ahead a series is searched for its next reminder (whole windows of the recurrence atom, about five years).
LOOKAHEAD_WINDOWS = 5


@dataclass(frozen=True, slots=True)
class ReminderRule:
    offset_minutes: int | None
    all_day_time: time | None
    all_day_days_before: int | None


@dataclass(frozen=True, slots=True)
class EventTimes:
    all_day: bool
    start_date: date
    start_time: time | None
    tzid: str
    rrule: str | None
    exceptions: frozenset[date]


@dataclass(frozen=True, slots=True)
class NextFire:
    at: datetime
    occurrence: date


def fire_time(rule: ReminderRule, event: EventTimes, occurrence: date, owner_tz: str) -> datetime:
    """The moment the reminder of `occurrence` (its date in the event's zone) fires, in UTC."""
    if rule.offset_minutes is not None:
        if not event.all_day and event.start_time is not None:
            start = local_to_utc(occurrence, event.start_time, event.tzid).utc
        else:
            start = local_to_utc(occurrence, time(0, 0), owner_tz).utc
        return start - timedelta(minutes=rule.offset_minutes)
    day = occurrence - timedelta(days=rule.all_day_days_before or 0)
    return local_to_utc(day, rule.all_day_time or time(9, 0), owner_tz).utc


def _occurrences_from(event: EventTimes, first: date) -> list[date]:
    """The event's occurrences on or after `first`, in order (a one-off event has its start date only)."""
    if event.rrule is None:
        return [event.start_date] if event.start_date >= first else []
    found: list[date] = []
    window_from = max(first, event.start_date)
    for _ in range(LOOKAHEAD_WINDOWS):
        window_to = window_from + timedelta(days=MAX_WINDOW_DAYS)
        found += occurrences(
            start_date=event.start_date,
            rrule=event.rrule,
            exceptions=event.exceptions,
            window_from=window_from,
            window_to=window_to,
        )
        window_from = window_to + timedelta(days=1)
    return found


def next_fire(
    rule: ReminderRule,
    event: EventTimes,
    owner_tz: str,
    *,
    after_occurrence: date | None,
    not_before: datetime,
) -> NextFire | None:
    """The next fire after the occurrence `after_occurrence`, not before `not_before`; None when there is none."""
    # A fire is never after its occurrence's start plus a day (zones), nor more than 28 days and 40320 minutes early.
    first = not_before.date() - timedelta(days=2)
    if after_occurrence is not None:
        first = max(first, after_occurrence + timedelta(days=1))
    for occurrence in _occurrences_from(event, first):
        at = fire_time(rule, event, occurrence, owner_tz)
        if at >= not_before:
            return NextFire(at=at, occurrence=occurrence)
    return None
