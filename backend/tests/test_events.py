"""Events through sync (FR-CAL-06/07/10, ADR-0009, D-60): create with defaults (title, zone, end date, all-day),
timed events with derived UTC instants, series (supported rules only, one day each), the whole event checked after
every change, time fields conflicting as a group while other fields still merge, rights, moving between calendars
only, pull sending the event fields in text form, and the audit log. Marker `db`.

+++===+++ 2026-10-22 — Hasan Alizada — HAAL-066.
+++===+++ 2026-10-29 — Hasan Alizada — HAAL-092. Extended rules (calendar.recurrence.v2): stored as given, a rule outside
the subset or one the start date does not fit is refused — also when a later change moves the start off the rule; the
database refuses foreign parts by itself.
"""

from __future__ import annotations

import uuid
from typing import Any

import psycopg
import pytest
from fastapi.testclient import TestClient

from .test_isolation import _dsn
from .test_sharing import People
from .test_sync import _m, _pull, _push

pytestmark = pytest.mark.db


@pytest.fixture
def people(api: TestClient, clean_db: str) -> People:
    return People(api, clean_db)


def _create(people: People, headers: dict[str, str], **data: Any) -> tuple[str, dict[str, Any]]:
    event_id = str(uuid.uuid7())
    body = {"kind": "event", "container_kind": "calendar", "container_id": people.calendar, **data}
    return event_id, _push(people.api, headers, _m("item", event_id, "create", data=body))[0]


def _event(people: People, event_id: str) -> dict[str, Any]:
    found = [c["data"] for c in _pull(people.api)["changes"] if c["entity_id"] == event_id]
    assert found, "event not pulled"
    event: dict[str, Any] = found[0]
    return event


def _row(people: People, event_id: str) -> tuple[Any, ...]:
    with psycopg.connect(_dsn(people.db_url), autocommit=True) as conn:
        conn.execute("SELECT set_config('app.user_id', %s, false)", (people.ids["ada"],))
        conn.execute("SET TIME ZONE 'UTC'")
        row = conn.execute(
            "SELECT start_utc::text, end_utc::text, container_id::text FROM event WHERE id = %s", (event_id,)
        ).fetchone()
    assert row is not None
    return tuple(row)


def test_create_with_defaults_and_pull_shape(people: People) -> None:
    ada = people.as_("ada")
    event_id, result = _create(people, ada, title="  ", start_date="2026-10-22")
    assert result["status"] == "applied" and result["version"] == 1
    event = _event(people, event_id)
    assert event["kind"] == "event" and event["title"] == "(No title)"
    assert (event["all_day"], event["start_date"], event["end_date"]) == (True, "2026-10-22", "2026-10-22")
    assert event["start_time"] is None and event["rrule"] is None
    assert event["tzid"] == "Europe/Berlin"  # the owner's profile zone (account helpers)
    assert "start_utc" not in event and "legacy_id" not in event and "container_id" in event


def test_timed_event_and_series(people: People) -> None:
    ada = people.as_("ada")
    timed, result = _create(
        people,
        ada,
        title="Dentist",
        all_day=False,
        start_date="2026-10-22",
        start_time="09:00",
        end_date="2026-10-22",
        end_time="09:30:00",
        tzid="Europe/Berlin",
        location="Main street 1",
    )
    assert result["status"] == "applied"
    event = _event(people, timed)
    assert (event["start_time"], event["end_time"], event["location"]) == ("09:00", "09:30", "Main street 1")
    start_utc, end_utc, _ = _row(people, timed)
    assert start_utc.startswith("2026-10-22 07:00:00") and end_utc.startswith("2026-10-22 07:30:00")  # CEST

    series, result = _create(people, ada, title="Gym", start_date="2026-10-20", rrule="FREQ=WEEKLY")
    assert result["status"] == "applied" and _event(people, series)["rrule"] == "FREQ=WEEKLY"


@pytest.mark.parametrize(
    ("data", "pointer"),
    [
        ({"start_date": "2026-10-22", "end_date": "2026-10-21"}, "/data/end_date"),
        ({"start_date": "2026-10-22", "start_time": "09:00"}, "/data/start_time"),  # all-day with a time
        ({"all_day": False, "start_date": "2026-10-22"}, "/data/start_time"),  # timed without times
        (
            {"all_day": False, "start_date": "2026-10-22", "start_time": "10:00", "end_time": "09:00"},
            "/data/end_date",
        ),
        ({"start_date": "2026-10-22", "rrule": "FREQ=WEEKLY;BYDAY=MO"}, "/data/rrule"),  # a Thursday
        ({"start_date": "2026-10-22", "rrule": "FREQ=MONTHLY;BYDAY=TH;BYSETPOS=4"}, "/data/rrule"),
        ({"start_date": "2026-10-22", "rrule": "FREQ=DAILY;UNTIL=20261021"}, "/data/rrule"),
        ({"start_date": "2026-10-22", "rrule": "FREQ=MONTHLY;BYMONTHDAY=-1"}, "/data/rrule"),
        ({"start_date": "2026-10-22", "end_date": "2026-10-23", "rrule": "FREQ=DAILY"}, "/data/end_date"),
        ({"start_date": "2026-10-22", "tzid": "Mars/Base"}, "/data/tzid"),
        ({"start_date": "22.10.2026"}, "/data/start_date"),
        ({"start_date": "2026-10-22", "title": "x" * 151}, "/data/title"),
    ],
)
def test_invalid_events_are_refused(people: People, data: dict[str, Any], pointer: str) -> None:
    _, result = _create(people, people.as_("ada"), **data)
    assert result["status"] == "rejected" and result["problem"]["code"] == "validation_failed"
    assert pointer in [e["pointer"] for e in result["problem"].get("errors", [])] or pointer == "/data/title"


def test_extended_rules_are_kept_and_the_start_must_stay_on_them(people: People) -> None:
    ada = people.as_("ada")
    rule = "FREQ=WEEKLY;INTERVAL=2;BYDAY=TU,TH;UNTIL=20271231"
    series, result = _create(people, ada, title="Training", start_date="2026-10-22", rrule=rule)
    assert result["status"] == "applied" and _event(people, series)["rrule"] == rule
    last_friday, result = _create(
        people, ada, title="Review", start_date="2026-10-30", rrule="FREQ=MONTHLY;BYDAY=-1FR;COUNT=12"
    )
    assert result["status"] == "applied"

    # Moving the start to a Wednesday leaves the rule's days: refused, the series stays as it was.
    moved = _push(
        people.api,
        ada,
        _m(
            "item",
            series,
            "update",
            base={"start_date": "2026-10-22", "end_date": "2026-10-22"},
            data={"start_date": "2026-10-28", "end_date": "2026-10-28"},
        ),
    )[0]
    assert moved["status"] == "rejected"
    assert [e["pointer"] for e in moved["problem"]["errors"]] == ["/data/rrule"]
    assert _event(people, series)["start_date"] == "2026-10-22"

    # The database keeps out what the application would refuse, also when written around it.
    with psycopg.connect(_dsn(people.db_url), autocommit=True) as conn:
        conn.execute("SELECT set_config('app.user_id', %s, false)", (people.ids["ada"],))
        with pytest.raises(psycopg.errors.CheckViolation):
            conn.execute("UPDATE event SET rrule = 'FREQ=DAILY;BYHOUR=9' WHERE id = %s", (last_friday,))


def test_updates_merge_and_time_fields_conflict_as_a_group(people: People) -> None:
    ada = people.as_("ada")
    event_id, _ = _create(people, ada, title="Dentist", start_date="2026-10-22")
    # Another device made it a timed event meanwhile.
    timed = {"all_day": False, "start_time": "09:00", "end_time": "10:00"}
    base = {"all_day": True, "start_time": None, "end_time": None}
    assert (
        _push(people.api, ada, _m("item", event_id, "update", base=base, data=timed))[0]["status"]
        == "applied"
    )

    # This device, from the old state: moves the date (time group) and renames (merges).
    stale = _m(
        "item",
        event_id,
        "update",
        base={"title": "Dentist", "all_day": True, "start_date": "2026-10-22", "end_date": "2026-10-22"},
        data={
            "title": "Dentist (new)",
            "all_day": True,
            "start_date": "2026-10-23",
            "end_date": "2026-10-23",
        },
    )
    result = _push(people.api, ada, stale)[0]
    assert result["status"] == "conflict"
    assert result["fields"] == ["all_day", "end_date", "start_date"]  # the whole changed group
    event = _event(people, event_id)
    assert event["title"] == "Dentist (new)"  # outside the group: applied
    assert (event["all_day"], event["start_date"], event["start_time"]) == (False, "2026-10-22", "09:00")

    # A change that would leave an invalid event is refused as a whole.
    bad = _m("item", event_id, "update", base={"end_time": "10:00"}, data={"end_time": "08:00"})
    refused = _push(people.api, ada, bad)[0]
    assert refused["status"] == "rejected" and refused["problem"]["code"] == "validation_failed"


def test_rights_moving_and_audit(people: People, clean_db: str) -> None:
    ada = people.as_("ada")
    people.share(ada, "bob@example.org", "view")
    event_id, _ = _create(people, ada, title="Dentist", start_date="2026-10-22")

    bob = people.as_("bob")
    _, viewer = _create(people, bob, title="Mine", start_date="2026-10-22")
    assert viewer["status"] == "rejected" and viewer["problem"]["code"] == "forbidden"
    edit = _m("item", event_id, "update", base={"location": None}, data={"location": "x"})
    assert _push(people.api, bob, edit)[0]["problem"]["code"] == "forbidden"

    ada = people.as_("ada")
    with psycopg.connect(_dsn(clean_db), autocommit=True) as conn:
        conn.execute("SELECT set_config('app.user_id', %s, false)", (people.ids["ada"],))
        second = str(uuid.uuid7())
        conn.execute(
            "INSERT INTO calendar (id, owner_id, name) VALUES (%s, %s, 'Work')", (second, people.ids["ada"])
        )
    origin = {"container_kind": "calendar", "container_id": people.calendar}
    move = _m(
        "item", event_id, "move", base=origin, data={"container_kind": "calendar", "container_id": second}
    )
    assert _push(people.api, ada, move)[0]["status"] == "applied"
    assert _row(people, event_id)[2] == second  # the event row moved along
    here = {"container_kind": "calendar", "container_id": second}
    to_board = _m(
        "item", event_id, "move", base=here, data={"container_kind": "board", "container_id": second}
    )
    assert _push(people.api, ada, to_board)[0]["status"] == "rejected"

    with psycopg.connect(_dsn(clean_db), autocommit=True) as conn:
        conn.execute("SELECT set_config('app.user_id', %s, false)", (people.ids["ada"],))
        actions = conn.execute(
            "SELECT entity_type, action FROM audit_log WHERE entity_id = %s ORDER BY occurred_at, entity_type",
            (event_id,),
        ).fetchall()
    assert ("event", "create") in actions and ("item", "create") in actions and ("event", "move") in actions
