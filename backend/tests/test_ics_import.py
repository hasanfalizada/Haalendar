"""ICS import and export through the API (FR-CAL-33, D-83): the report, a series with excluded and replaced dates, a
second import skipping what is there, rights (view only, archived), limits, the export and a round trip into another
calendar. Marker `db`.

+++===+++ 2026-10-29 — Hasan Alizada — HAAL-095.
"""

from __future__ import annotations

import uuid
from typing import Any

import pytest
from fastapi.testclient import TestClient

from .test_reminders import _as
from .test_sharing import People
from .test_sync import _m, _pull, _push


@pytest.fixture
def people(api: TestClient, clean_db: str) -> People:
    return People(api, clean_db)


FILE = (
    b"BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:test\r\n"
    b"BEGIN:VEVENT\r\nUID:standup\r\nSUMMARY:Standup\r\n"
    b"DTSTART;TZID=Europe/Berlin:20261102T100000\r\nDTEND;TZID=Europe/Berlin:20261102T101500\r\n"
    b"RRULE:FREQ=WEEKLY;BYDAY=MO,WE;COUNT=8\r\nEXDATE;TZID=Europe/Berlin:20261104T100000\r\nEND:VEVENT\r\n"
    b"BEGIN:VEVENT\r\nUID:standup\r\nRECURRENCE-ID;TZID=Europe/Berlin:20261109T100000\r\nSUMMARY:Standup (room 7)\r\n"
    b"DTSTART;TZID=Europe/Berlin:20261109T110000\r\nDTEND;TZID=Europe/Berlin:20261109T111500\r\nEND:VEVENT\r\n"
    b"BEGIN:VEVENT\r\nUID:holiday\r\nSUMMARY:Holiday\r\nDESCRIPTION:Line one\\nLine two\r\n"
    b"DTSTART;VALUE=DATE:20261224\r\nDTEND;VALUE=DATE:20261227\r\nEND:VEVENT\r\n"
    b"BEGIN:VEVENT\r\nUID:hourly\r\nSUMMARY:Ping\r\nDTSTART:20261102T100000Z\r\nRRULE:FREQ=HOURLY\r\nEND:VEVENT\r\n"
    b"END:VCALENDAR\r\n"
)


def _import(
    people: People, headers: dict[str, str], calendar: str, body: bytes, kind: str = "text/calendar"
) -> Any:
    return people.api.post(
        f"/api/v1/calendars/{calendar}/import-ics", content=body, headers={**headers, "Content-Type": kind}
    )


def _events(people: People, calendar: str) -> list[tuple[Any, ...]]:
    return _as(
        people,
        "ada",
        "SELECT i.title, e.start_date::text, e.end_date::text, e.rrule, e.ics_uid, "
        "(SELECT array_agg(x.occurrence_date::text || ':' || x.kind ORDER BY x.occurrence_date) "
        " FROM recurrence_exception x WHERE x.event_id = e.id AND x.deleted_at IS NULL) "
        "FROM item i JOIN event e ON e.id = i.id WHERE i.container_id = %s AND i.deleted_at IS NULL "
        "ORDER BY e.start_date, i.title",
        calendar,
    )


@pytest.mark.db
def test_import_reports_and_a_second_import_skips_what_is_there(people: People) -> None:
    ada = people.as_("ada")
    response = _import(people, ada, people.calendar, FILE)
    assert response.status_code == 200, response.text
    report = response.json()
    assert (report["imported"], report["skipped"]) == (3, 1)
    assert report["skipped_events"] == [{"title": "Ping", "reason": "Its repeat rule is not supported"}]
    assert len(report["item_ids"]) == 3
    events = _events(people, people.calendar)
    assert events == [
        (
            "Standup",
            "2026-11-02",
            "2026-11-02",
            "FREQ=WEEKLY;BYDAY=MO,WE;COUNT=8",
            "standup",
            ["2026-11-04:cancelled", "2026-11-09:overridden"],
        ),
        ("Standup (room 7)", "2026-11-09", "2026-11-09", None, None, None),
        ("Holiday", "2026-12-24", "2026-12-26", None, "holiday", None),
    ]
    holiday = [
        c["data"] for c in _pull(people.api)["changes"] if c["data"] and c["data"].get("title") == "Holiday"
    ]
    assert holiday[0]["body"] == "Line one\nLine two" and "ics_uid" not in holiday[0]

    again = _import(people, ada, people.calendar, FILE).json()
    assert (again["imported"], again["skipped"]) == (0, 4)
    assert {e["reason"] for e in again["skipped_events"]} == {
        "It was imported before",
        "Its repeat rule is not supported",
    }
    assert len(_events(people, people.calendar)) == 3

    # Deleted events do not count: the file comes in again.
    for item_id in report["item_ids"]:
        _push(people.api, ada, _m("item", item_id, "delete"))
    assert _import(people, ada, people.calendar, FILE).json()["imported"] == 3


@pytest.mark.db
def test_rights_limits_and_files_that_are_no_calendar(people: People) -> None:
    assert people.share(people.as_("ada"), "bob@example.org", "view").status_code == 201
    bob = people.as_("bob")
    assert _import(people, bob, people.calendar, FILE).status_code == 403
    assert people.api.get(f"/api/v1/calendars/{people.calendar}/export.ics", headers=bob).status_code == 200
    unknown = str(uuid.uuid7())
    assert _import(people, bob, unknown, FILE).status_code == 404

    ada = people.as_("ada")
    assert _import(people, ada, people.calendar, b"hello").status_code == 422
    assert _import(people, ada, people.calendar, FILE, kind="application/json").status_code == 415
    assert _import(people, ada, people.calendar, b"x" * (5 * 1024 * 1024 + 1)).status_code == 413
    archived = _push(
        people.api,
        ada,
        _m(
            "calendar",
            people.calendar,
            "update",
            base={"archived_at": None},
            data={"archived_at": "2026-10-29T10:00:00Z"},
        ),
    )[0]
    assert archived["status"] == "applied"
    assert _import(people, ada, people.calendar, FILE).status_code == 409


@pytest.mark.db
def test_export_and_round_trip_into_another_calendar(people: People) -> None:
    ada = people.as_("ada")
    assert _import(people, ada, people.calendar, FILE).status_code == 200
    response = people.api.get(f"/api/v1/calendars/{people.calendar}/export.ics", headers=ada)
    assert response.status_code == 200
    assert response.headers["content-type"].startswith("text/calendar")
    assert "attachment; filename*=UTF-8''Family.ics" in response.headers["content-disposition"]
    text = response.text
    assert text.startswith("BEGIN:VCALENDAR\r\nVERSION:2.0\r\n") and "TZID:Europe/Berlin" in text
    assert "UID:standup\r\n" in text and "RRULE:FREQ=WEEKLY;COUNT=8;BYDAY=MO,WE\r\n" in text
    assert "EXDATE;TZID=Europe/Berlin:20261104T100000" in text
    assert "EXDATE;TZID=Europe/Berlin:20261109T100000" in text  # the replaced date: its own event
    assert "DTSTART;VALUE=DATE:20261224" in text and "DTEND;VALUE=DATE:20261227" in text

    other = str(uuid.uuid7())
    _push(people.api, ada, _m("calendar", other, "create", data={"name": "Copy"}))
    report = _import(people, ada, other, response.content).json()
    assert (report["imported"], report["skipped"]) == (3, 0)
    original = [row[:4] for row in _events(people, people.calendar)]
    assert [row[:4] for row in _events(people, other)] == original
    copied = {row[0]: row[5] for row in _events(people, other)}
    assert copied["Standup"] == ["2026-11-04:cancelled", "2026-11-09:cancelled"]
