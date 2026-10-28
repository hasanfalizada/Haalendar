"""When reminders fire (FR-CAL-29, D-79): both forms on timed and all-day events, the event's and the owner's zones,
series with excluded dates, a time already passed when set, and missed fires. Pure functions, no database.

+++===+++ 2026-10-28 — Hasan Alizada — HAAL-091.
"""

from __future__ import annotations

from datetime import UTC, date, datetime, time

from haalendar.planning.reminder_times import EventTimes, NextFire, ReminderRule, fire_time, next_fire

BEFORE_15 = ReminderRule(offset_minutes=15, all_day_time=None, all_day_days_before=None)
DAY_BEFORE_AT_9 = ReminderRule(offset_minutes=None, all_day_time=time(9, 0), all_day_days_before=1)

DENTIST = EventTimes(
    all_day=False,
    start_date=date(2026, 11, 10),
    start_time=time(11, 0),
    tzid="Europe/Berlin",
    rrule=None,
    exceptions=frozenset(),
)
HOLIDAY = EventTimes(
    all_day=True,
    start_date=date(2026, 12, 25),
    start_time=None,
    tzid="Europe/Berlin",
    rrule=None,
    exceptions=frozenset(),
)


def utc(year: int, month: int, day: int, hour: int = 0, minute: int = 0) -> datetime:
    return datetime(year, month, day, hour, minute, tzinfo=UTC)


def test_before_the_start_of_a_timed_event_in_its_own_zone() -> None:
    # 11:00 in Berlin (UTC+1 in November) is 10:00 UTC; 15 minutes before.
    assert fire_time(BEFORE_15, DENTIST, date(2026, 11, 10), "Asia/Baku") == utc(2026, 11, 10, 9, 45)


def test_on_the_day_at_a_time_in_the_owners_zone() -> None:
    # The day before at 09:00 in Baku (UTC+4) is 05:00 UTC, whatever the event's zone.
    assert fire_time(DAY_BEFORE_AT_9, HOLIDAY, date(2026, 12, 25), "Asia/Baku") == utc(2026, 12, 24, 5, 0)
    # The same form on a timed event works too.
    assert fire_time(DAY_BEFORE_AT_9, DENTIST, date(2026, 11, 10), "Asia/Baku") == utc(2026, 11, 9, 5, 0)


def test_before_an_all_day_event_counts_from_midnight_in_the_owners_zone() -> None:
    assert fire_time(BEFORE_15, HOLIDAY, date(2026, 12, 25), "Europe/Berlin") == utc(2026, 12, 24, 22, 45)


def test_a_one_off_event_fires_once() -> None:
    first = next_fire(BEFORE_15, DENTIST, "Asia/Baku", after_occurrence=None, not_before=utc(2026, 11, 1))
    assert first == NextFire(at=utc(2026, 11, 10, 9, 45), occurrence=date(2026, 11, 10))
    after = next_fire(
        BEFORE_15,
        DENTIST,
        "Asia/Baku",
        after_occurrence=date(2026, 11, 10),
        not_before=utc(2026, 11, 10, 9, 45),
    )
    assert after is None


def test_a_time_already_passed_when_set_does_not_fire() -> None:
    assert (
        next_fire(BEFORE_15, DENTIST, "Asia/Baku", after_occurrence=None, not_before=utc(2026, 11, 10, 9, 50))
        is None
    )


def test_a_series_fires_for_each_occurrence_and_skips_excluded_dates() -> None:
    standup = EventTimes(
        all_day=False,
        start_date=date(2026, 11, 2),
        start_time=time(9, 0),
        tzid="Europe/Berlin",
        rrule="FREQ=DAILY",
        exceptions=frozenset({date(2026, 11, 4)}),
    )
    first = next_fire(
        BEFORE_15, standup, "Europe/Berlin", after_occurrence=None, not_before=utc(2026, 11, 3, 9, 0)
    )
    # 3 November 07:45 UTC has passed at 09:00; 4 November is excluded: the 5th is next.
    assert first == NextFire(at=utc(2026, 11, 5, 7, 45), occurrence=date(2026, 11, 5))
    second = next_fire(
        BEFORE_15,
        standup,
        "Europe/Berlin",
        after_occurrence=date(2026, 11, 5),
        not_before=utc(2026, 11, 5, 7, 45),
    )
    assert second == NextFire(at=utc(2026, 11, 6, 7, 45), occurrence=date(2026, 11, 6))


def test_missed_fires_are_skipped_after_the_one_delivered_late() -> None:
    weekly = EventTimes(
        all_day=True,
        start_date=date(2026, 11, 2),
        start_time=None,
        tzid="Europe/Berlin",
        rrule="FREQ=WEEKLY",
        exceptions=frozenset(),
    )
    # The server was down from 1 to 20 November: after the late fire for the 2nd the next is the 23rd, not the 9th.
    after_outage = next_fire(
        DAY_BEFORE_AT_9,
        weekly,
        "Europe/Berlin",
        after_occurrence=date(2026, 11, 2),
        not_before=utc(2026, 11, 20),
    )
    assert after_outage == NextFire(at=utc(2026, 11, 22, 8, 0), occurrence=date(2026, 11, 23))


def test_a_distant_reminder_of_a_series_starting_far_ahead() -> None:
    yearly = EventTimes(
        all_day=True,
        start_date=date(2027, 3, 1),
        start_time=None,
        tzid="UTC",
        rrule="FREQ=YEARLY",
        exceptions=frozenset(),
    )
    found = next_fire(
        ReminderRule(offset_minutes=None, all_day_time=time(8, 30), all_day_days_before=28),
        yearly,
        "UTC",
        after_occurrence=None,
        not_before=utc(2026, 10, 28),
    )
    assert found == NextFire(at=utc(2027, 2, 1, 8, 30), occurrence=date(2027, 3, 1))
