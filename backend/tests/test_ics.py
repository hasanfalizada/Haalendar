"""Reading .ics files (FR-CAL-33, D-83), pure: all-day ends, zones (IANA, Windows with the file's VTIMEZONE, UTC,
floating), DURATION, repeat rules mapped into the supported subset or refused with the reason, a start moved to the
first repeat date, EXDATE / RDATE / RECURRENCE-ID / cancelled, fields cut to their limits, warnings.

+++===+++ 2026-10-29 — Hasan Alizada — HAAL-095.
"""

from __future__ import annotations

from datetime import date

import pytest

from haalendar.planning import ics

ZONE = "Europe/Berlin"

WINDOWS_TZ = """BEGIN:VTIMEZONE
TZID:W. Europe Standard Time
BEGIN:STANDARD
DTSTART:16010101T030000
TZOFFSETFROM:+0200
TZOFFSETTO:+0100
RRULE:FREQ=YEARLY;BYDAY=-1SU;BYMONTH=10
END:STANDARD
BEGIN:DAYLIGHT
DTSTART:16010101T020000
TZOFFSETFROM:+0100
TZOFFSETTO:+0200
RRULE:FREQ=YEARLY;BYDAY=-1SU;BYMONTH=3
END:DAYLIGHT
END:VTIMEZONE
"""


def _file(*events: str, extra: str = "") -> bytes:
    body = "BEGIN:VCALENDAR\nVERSION:2.0\nPRODID:test\n" + extra + "".join(events) + "END:VCALENDAR\n"
    return body.replace("\n", "\r\n").encode("utf-8")


def _event(*lines: str) -> str:
    return "BEGIN:VEVENT\n" + "".join(line + "\n" for line in lines) + "END:VEVENT\n"


def _has(found: dict[str, object], expected: dict[str, object]) -> bool:
    return all(found.get(name) == value for name, value in expected.items())


def _parse(*events: str, extra: str = "") -> ics.Parsed:
    return ics.parse(_file(*events, extra=extra), ZONE, "green")


def test_times_all_day_zones_and_duration() -> None:
    parsed = _parse(
        _event("UID:a", "SUMMARY:Holiday", "DTSTART;VALUE=DATE:20261224", "DTEND;VALUE=DATE:20261227"),
        _event("UID:b", "SUMMARY:Day", "DTSTART;VALUE=DATE:20261105"),
        _event(
            "UID:c",
            "SUMMARY:NY call",
            "DTSTART;TZID=America/New_York:20261106T090000",
            "DTEND;TZID=America/New_York:20261106T100000",
        ),
        _event("UID:d", "SUMMARY:UTC", "DTSTART:20261105T090000Z", "DURATION:PT45M"),
        _event("UID:e", "SUMMARY:Floating", "DTSTART:20261106T093012"),
        _event(
            "UID:f",
            "SUMMARY:Outlook",
            "DTSTART;TZID=W. Europe Standard Time:20261102T100000",
            "DTEND;TZID=W. Europe Standard Time:20261102T101500",
        ),
        extra=WINDOWS_TZ,
    )
    data = {d.uid: d.data for d in parsed.events}
    assert _has(data["a"], {"all_day": True, "start_date": "2026-12-24", "end_date": "2026-12-26"})
    assert data["b"]["end_date"] == "2026-11-05"
    assert _has(data["c"], {"tzid": "America/New_York", "start_time": "09:00", "end_time": "10:00"})
    # UTC → the user's zone (09:00Z = 10:00 in Berlin in November)
    assert _has(data["d"], {"tzid": ZONE, "start_time": "10:00", "end_time": "10:45"})
    assert _has(data["e"], {"tzid": ZONE, "start_time": "09:30", "end_time": "09:30"})  # seconds dropped
    assert _has(data["f"], {"tzid": "Europe/Berlin", "start_time": "10:00", "end_time": "10:15"})
    assert all(d["color"] == "green" and d["priority"] == "medium" for d in data.values())
    assert parsed.skipped == [] and parsed.warnings == []


@pytest.mark.parametrize(
    ("rule", "start", "mapped"),
    [
        ("FREQ=WEEKLY;BYDAY=MO,WE;WKST=MO", "20261102", "FREQ=WEEKLY;BYDAY=MO,WE"),
        ("FREQ=MONTHLY;BYDAY=-1FR;COUNT=5", "20261127", "FREQ=MONTHLY;BYDAY=-1FR;COUNT=5"),
        ("FREQ=MONTHLY;BYDAY=+2TU", "20261110", "FREQ=MONTHLY;BYDAY=2TU"),
        ("FREQ=YEARLY;BYMONTH=11", "20261110", "FREQ=YEARLY"),
        ("FREQ=DAILY;INTERVAL=2;UNTIL=20261130T225959Z", "20261102", "FREQ=DAILY;INTERVAL=2;UNTIL=20261130"),
    ],
)
def test_rules_mapped_into_the_subset(rule: str, start: str, mapped: str) -> None:
    parsed = _parse(_event("UID:r", "SUMMARY:Rule", f"DTSTART;VALUE=DATE:{start}", f"RRULE:{rule}"))
    assert [d.data["rrule"] for d in parsed.events] == [mapped]


def test_unsupported_rules_multi_day_series_and_cancelled_are_skipped_with_reasons() -> None:
    parsed = _parse(
        _event("UID:1", "SUMMARY:Hourly", "DTSTART:20261102T100000Z", "RRULE:FREQ=HOURLY"),
        _event(
            "UID:2",
            "SUMMARY:Last workday",
            "DTSTART;VALUE=DATE:20261130",
            "RRULE:FREQ=MONTHLY;BYDAY=MO,TU,WE,TH,FR;BYSETPOS=-1",
        ),
        _event(
            "UID:3",
            "SUMMARY:Trip",
            "DTSTART;VALUE=DATE:20261102",
            "DTEND;VALUE=DATE:20261104",
            "RRULE:FREQ=WEEKLY",
        ),
        _event("UID:4", "SUMMARY:Off", "DTSTART;VALUE=DATE:20261102", "STATUS:CANCELLED"),
        _event("UID:5", "SUMMARY:No start"),
        "BEGIN:VTODO\nUID:t\nSUMMARY:Task\nEND:VTODO\n",
    )
    assert parsed.events == []
    assert parsed.skipped == [
        ("Hourly", "Its repeat rule is not supported"),
        ("Last workday", "Its repeat rule is not supported"),
        ("Trip", "A repeating event lasts one day here"),
        ("Off", "It is cancelled"),
        ("No start", "It has no start"),
    ]
    assert parsed.warnings == ["1 tasks or journal entries were left out: only events are imported"]


def test_series_details_moved_start_exdate_rdate_and_replaced_occurrences() -> None:
    parsed = _parse(
        _event(
            "UID:s",
            "SUMMARY:Standup",
            "DTSTART;TZID=W. Europe Standard Time:20261101T100000",  # a Sunday: the rule starts on Monday
            "DTEND;TZID=W. Europe Standard Time:20261101T101500",
            "RRULE:FREQ=WEEKLY;BYDAY=MO,WE",
            "EXDATE;TZID=W. Europe Standard Time:20261104T100000,20261109T100000",
            "RDATE;TZID=W. Europe Standard Time:20261107T100000",
            "BEGIN:VALARM\nACTION:DISPLAY\nTRIGGER:-PT15M\nEND:VALARM",
        ),
        _event(
            "UID:s",
            "RECURRENCE-ID;TZID=W. Europe Standard Time:20261111T100000",
            "SUMMARY:Standup (moved)",
            "DTSTART;TZID=W. Europe Standard Time:20261111T120000",
            "DURATION:PT30M",
        ),
        _event(
            "UID:s",
            "RECURRENCE-ID;TZID=W. Europe Standard Time:20261116T100000",
            "SUMMARY:Standup",
            "DTSTART;TZID=W. Europe Standard Time:20261116T100000",
            "STATUS:CANCELLED",
        ),
        extra=WINDOWS_TZ,
    )
    series, extra = parsed.events
    assert _has(
        series.data,
        {"start_date": "2026-11-02", "end_date": "2026-11-02", "rrule": "FREQ=WEEKLY;BYDAY=MO,WE"},
    )
    assert series.exdates == [date(2026, 11, 4), date(2026, 11, 9)]
    assert extra.uid is None and _has(
        extra.data, {"start_date": "2026-11-07", "rrule": None, "start_time": "10:00"}
    )
    moved, cancelled = parsed.overrides["s"]
    assert moved.recurrence_of == date(2026, 11, 11) and moved.data["start_time"] == "12:00"
    assert moved.data["end_time"] == "12:30" and not moved.cancelled
    assert cancelled.recurrence_of == date(2026, 11, 16) and cancelled.cancelled
    assert parsed.warnings == [
        "“Standup”: it starts on its first repeat date, 2026-11-02",
        "Reminders of 1 events were not imported: set them in Haalendar",
    ]


def test_long_fields_are_cut_and_priorities_mapped() -> None:
    parsed = _parse(
        _event(
            "UID:l",
            "SUMMARY:" + "T" * 160,
            "LOCATION:" + "P" * 520,
            "PRIORITY:1",
            "DTSTART;VALUE=DATE:20261102",
        ),
        _event("UID:m", "SUMMARY:Low", "PRIORITY:9", "DTSTART;VALUE=DATE:20261102"),
    )
    long, low = parsed.events
    assert len(long.title) == 150 and len(long.data["location"]) == 500 and long.data["priority"] == "high"
    assert low.data["priority"] == "low"
    assert len(parsed.warnings) == 2


def test_not_a_calendar() -> None:
    with pytest.raises(ics.NotCalendarError):
        ics.parse(b"hello", ZONE, "blue")
    assert ics.iana_zone("/mozilla.org/20070129_1/Europe/Rome") == "Europe/Rome"
    assert ics.iana_zone("Pacific Standard Time") == "America/Los_Angeles"
    assert ics.iana_zone("Atlantis") is None
