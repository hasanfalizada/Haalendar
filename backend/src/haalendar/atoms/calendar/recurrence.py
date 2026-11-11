"""Atom calendar.recurrence.v2 — Python implementation (contract: atoms/calendar.recurrence.v2/contract.json).

+++===+++ 2026-10-22 — Hasan Alizada — HAAL-066. Pure function; must pass the atom's vectors.json. Dates only
(FR-CAL-10): daily, weekly (weekday of the start), monthly (day of month; months without it are skipped), yearly
(29 February only in leap years). The first candidate is computed directly, so a series started years ago costs no
more than one inside the window.
+++===+++ 2026-10-29 — Hasan Alizada — HAAL-092. Version 2 (FR-CAL-30, D-80): a subset of RFC 5545 RRULE — FREQ,
INTERVAL, BYDAY (weekly: days; monthly: one Nth weekday, 1st..4th or last), BYMONTHDAY (monthly: one day or -1 = the
last), UNTIL (a date) or COUNT. The rule is read into `Rule`; occurrences are generated per period (every INTERVAL
days, weeks from Monday, months or years from the start's), the first period of the window is computed directly and
COUNT counts the dates before it — arithmetically where every period has the same number of dates. The start date
must itself be an occurrence; excluded dates still count towards COUNT (RFC 5545).
"""

from __future__ import annotations

import calendar
import re
from collections.abc import Iterable, Iterator
from dataclasses import dataclass
from datetime import date, timedelta

MAX_WINDOW_DAYS = 366
MAX_INTERVAL = 99
MAX_COUNT = 999
WEEKDAYS = ("MO", "TU", "WE", "TH", "FR", "SA", "SU")
FREQS = ("DAILY", "WEEKLY", "MONTHLY", "YEARLY")
_NUMBER = re.compile(r"[1-9][0-9]*")
_NTH = re.compile(r"(-1|[1-4])(MO|TU|WE|TH|FR|SA|SU)")
_UNTIL = re.compile(r"([0-9]{4})([0-9]{2})([0-9]{2})")


class RecurrenceError(ValueError):
    code = ""


class UnsupportedRruleError(RecurrenceError):
    """Contract error UNSUPPORTED_RRULE."""

    code = "UNSUPPORTED_RRULE"


class StartNotInRuleError(RecurrenceError):
    """Contract error START_NOT_IN_RULE."""

    code = "START_NOT_IN_RULE"


class InvalidWindowError(RecurrenceError):
    """Contract error INVALID_WINDOW."""

    code = "INVALID_WINDOW"


class WindowTooLargeError(RecurrenceError):
    """Contract error WINDOW_TOO_LARGE."""

    code = "WINDOW_TOO_LARGE"


@dataclass(frozen=True, slots=True)
class Rule:
    freq: str
    interval: int = 1
    weekdays: tuple[int, ...] = ()  # weekly: chosen days, Monday = 0; empty = the start's weekday
    nth: tuple[int, int] | None = None  # monthly: (1..4 or -1, weekday)
    month_day: int | None = None  # monthly: 1..31 or -1 (the last day)
    until: date | None = None
    count: int | None = None


def _unsupported() -> UnsupportedRruleError:
    return UnsupportedRruleError("unsupported RRULE")


def _number(value: str, highest: int) -> int:
    if not _NUMBER.fullmatch(value) or int(value) > highest:
        raise _unsupported()
    return int(value)


def parse_rule(rrule: str) -> Rule:
    """The rule's parts; raises UnsupportedRruleError for anything outside the supported subset."""
    parts: dict[str, str] = {}
    for part in rrule.split(";"):
        name, sep, value = part.partition("=")
        if not sep or not value or name in parts:
            raise _unsupported()
        parts[name] = value
    freq = parts.pop("FREQ", "")
    if freq not in FREQS:
        raise _unsupported()
    interval = _number(parts.pop("INTERVAL"), MAX_INTERVAL) if "INTERVAL" in parts else 1
    count = _number(parts.pop("COUNT"), MAX_COUNT) if "COUNT" in parts else None
    until = None
    if "UNTIL" in parts:
        found = _UNTIL.fullmatch(parts.pop("UNTIL"))
        try:
            until = date(*(int(g) for g in found.groups())) if found else None
        except ValueError:
            until = None
        if until is None or count is not None:
            raise _unsupported()
    weekdays: tuple[int, ...] = ()
    nth = None
    month_day = None
    byday = parts.pop("BYDAY", None)
    bymonthday = parts.pop("BYMONTHDAY", None)
    if parts:
        raise _unsupported()
    if byday is not None and freq == "WEEKLY":
        days = byday.split(",")
        if any(day not in WEEKDAYS for day in days) or len(set(days)) != len(days):
            raise _unsupported()
        weekdays = tuple(sorted(WEEKDAYS.index(day) for day in days))
    elif byday is not None and freq == "MONTHLY" and bymonthday is None:
        found = _NTH.fullmatch(byday)
        if not found:
            raise _unsupported()
        nth = (int(found.group(1)), WEEKDAYS.index(found.group(2)))
    elif byday is not None:
        raise _unsupported()
    if bymonthday is not None:
        if freq != "MONTHLY":
            raise _unsupported()
        month_day = -1 if bymonthday == "-1" else _number(bymonthday, 31)
    return Rule(freq, interval, weekdays, nth, month_day, until, count)


def is_supported(rrule: str | None) -> bool:
    if rrule is None:
        return True
    try:
        parse_rule(rrule)
    except UnsupportedRruleError:
        return False
    return True


def _add_months(year: int, month: int, months: int) -> tuple[int, int]:
    total = year * 12 + month - 1 + months
    return total // 12, total % 12 + 1


def _in_month(rule: Rule, start: date, year: int, month: int) -> date | None:
    last = calendar.monthrange(year, month)[1]
    if rule.nth is not None:
        ordinal, weekday = rule.nth
        if ordinal > 0:
            first = (weekday - date(year, month, 1).weekday()) % 7 + 1
            return date(year, month, first + 7 * (ordinal - 1))
        return date(year, month, last - (date(year, month, last).weekday() - weekday) % 7)
    day = rule.month_day if rule.month_day is not None else start.day
    if day == -1:
        return date(year, month, last)
    return date(year, month, day) if day <= last else None


class _Series:
    """The periods of one rule from one start date."""

    def __init__(self, rule: Rule, start: date) -> None:
        self.rule, self.start = rule, start
        self.days = rule.weekdays or (start.weekday(),)
        self.monday = start - timedelta(days=start.weekday())

    def period_start(self, k: int) -> date | None:
        """First date of period k (None beyond year 9999)."""
        step = k * self.rule.interval
        try:
            if self.rule.freq == "DAILY":
                return self.start + timedelta(days=step)
            if self.rule.freq == "WEEKLY":
                return self.monday + timedelta(days=7 * step)
            if self.rule.freq == "MONTHLY":
                year, month = _add_months(self.start.year, self.start.month, step)
                return date(year, month, 1) if year <= 9999 else None
            return date(self.start.year + step, 1, 1) if self.start.year + step <= 9999 else None
        except OverflowError:
            return None

    def dates(self, k: int) -> list[date]:
        """Occurrence candidates of period k, ascending, none before the start."""
        first = self.period_start(k)
        if first is None:
            return []
        if self.rule.freq == "DAILY":
            found = [first]
        elif self.rule.freq == "WEEKLY":
            found = []
            for day in self.days:
                try:
                    found.append(first + timedelta(days=day))
                except OverflowError:
                    break
        elif self.rule.freq == "MONTHLY":
            one = _in_month(self.rule, self.start, first.year, first.month)
            found = [one] if one else []
        elif self.start.month == 2 and self.start.day == 29 and not calendar.isleap(first.year):
            found = []
        else:
            found = [date(first.year, self.start.month, self.start.day)]
        return [day for day in found if day >= self.start]

    def first_period(self, day: date) -> int:
        """The period that holds `day` (or the last one starting before it)."""
        if day <= self.start:
            return 0
        rule = self.rule
        if rule.freq == "DAILY":
            return -(-(day - self.start).days // rule.interval)
        if rule.freq == "WEEKLY":
            return ((day - self.monday).days // 7) // rule.interval
        if rule.freq == "MONTHLY":
            return ((day.year - self.start.year) * 12 + day.month - self.start.month) // rule.interval
        return (day.year - self.start.year) // rule.interval

    def count_before(self, k: int) -> int:
        """How many occurrences the periods before k hold (stops early once past COUNT)."""
        if k == 0:
            return 0
        rule = self.rule
        if rule.freq == "DAILY":
            return k
        if rule.freq == "WEEKLY":
            return len(self.dates(0)) + (k - 1) * len(self.days)
        if rule.freq == "MONTHLY" and (rule.nth is not None or rule.month_day == -1 or self.start.day <= 28):
            return k
        limit = rule.count or 0
        seen = 0
        for period in range(k):
            seen += len(self.dates(period))
            if seen >= limit:
                break
        return seen


def _fits(rule: Rule, start: date) -> bool:
    if rule.until is not None and rule.until < start:
        return False
    if rule.weekdays and start.weekday() not in rule.weekdays:
        return False
    if rule.freq == "MONTHLY" and (rule.nth is not None or rule.month_day is not None):
        return _in_month(rule, start, start.year, start.month) == start
    return True


def check(start_date: date, rrule: str | None) -> None:
    """Raises UNSUPPORTED_RRULE or START_NOT_IN_RULE; a one-off event (None) always passes."""
    if rrule is not None and not _fits(parse_rule(rrule), start_date):
        raise StartNotInRuleError("the start date is not an occurrence of the rule")


def _candidates(rule: Rule, start: date, first: date, last: date) -> Iterator[date]:
    series = _Series(rule, start)
    k = series.first_period(first)
    seen = series.count_before(k) if rule.count is not None else 0
    end = min(last, rule.until) if rule.until is not None else last
    while True:
        period = series.period_start(k)
        if period is None or period > end or (rule.count is not None and seen >= rule.count):
            return
        for day in series.dates(k):
            if rule.count is not None:
                if seen >= rule.count:
                    return
                seen += 1
            if day > end:
                return
            yield day
        k += 1


def occurrences(
    *, start_date: date, rrule: str | None, exceptions: Iterable[date], window_from: date, window_to: date
) -> list[date]:
    """Occurrence dates inside [window_from, window_to], ascending, without exceptions."""
    rule = parse_rule(rrule) if rrule is not None else None
    if rule is not None and not _fits(rule, start_date):
        raise StartNotInRuleError("the start date is not an occurrence of the rule")
    if window_to < window_from:
        raise InvalidWindowError("window ends before it starts")
    if (window_to - window_from).days > MAX_WINDOW_DAYS:
        raise WindowTooLargeError("window longer than 367 days")
    first = max(start_date, window_from)
    if first > window_to:
        return []
    skipped = set(exceptions)
    found = [start_date] if rule is None else _candidates(rule, start_date, first, window_to)
    return [day for day in found if first <= day <= window_to and day not in skipped]
