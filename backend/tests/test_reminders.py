"""Reminders through sync and the worker (FR-CAL-29, D-79): create / change / delete / restore by their owner only,
one of two forms, at most five per event, personal also on a shared event; the worker computes the next fire, fires a
`reminder` notification (late when far behind), moves on to the next occurrence of a series, and follows changes of
the event and of access to it. Marker `db`.

+++===+++ 2026-10-28 — Hasan Alizada — HAAL-091.
"""

from __future__ import annotations

import asyncio
import uuid
from datetime import UTC, datetime, timedelta
from typing import Any

import psycopg
import pytest
from fastapi.testclient import TestClient

from haalendar.config import Settings
from haalendar.db import create_engine, create_session_factory
from haalendar.planning.reminders import check_reminders

from .account_helpers import sql_maintenance
from .conftest import make_settings
from .test_isolation import _dsn
from .test_sharing import People
from .test_sync import _m, _pull, _push


@pytest.fixture
def people(api: TestClient, clean_db: str) -> People:
    return People(api, clean_db)


def _event(people: People, headers: dict[str, str], **data: Any) -> str:
    event_id = str(uuid.uuid7())
    body = {
        "kind": "event",
        "container_kind": "calendar",
        "container_id": people.calendar,
        "title": "Dentist",
        "all_day": False,
        "start_date": "2026-11-10",
        "start_time": "11:00",
        "end_date": "2026-11-10",
        "end_time": "12:00",
        "tzid": "Europe/Berlin",
    }
    result = _push(people.api, headers, _m("item", event_id, "create", data={**body, **data}))[0]
    assert result["status"] == "applied", result
    return event_id


def _reminder(people: People, headers: dict[str, str], item: str, **form: Any) -> dict[str, Any]:
    reminder_id = str(uuid.uuid7())
    result = _push(
        people.api, headers, _m("reminder", reminder_id, "create", data={"item_id": item, **form})
    )[0]
    return {"id": reminder_id, **result}


def _run(people: People, at: datetime, settings: Settings | None = None) -> dict[str, int]:
    """One round of the worker; with `settings` it also sends Web Push (HAAL-091 stage 2)."""
    engine = create_engine(make_settings(database_url=people.db_url))

    async def go() -> dict[str, int]:
        try:
            return await check_reminders(create_session_factory(engine), now=at, settings=settings)
        finally:
            await engine.dispose()

    return asyncio.run(go())


def _as(people: People, name: str, statement: str, *params: object) -> list[tuple[Any, ...]]:
    """A query as that user (row-level security of the application role)."""
    with psycopg.connect(_dsn(people.db_url), autocommit=True) as conn:
        conn.execute("SELECT set_config('app.user_id', %s, false)", (people.ids[name],))
        return [tuple(row) for row in conn.execute(statement, params or None).fetchall()]


def _schedule(people: People, name: str, reminder_id: str) -> tuple[Any, ...]:
    rows = _as(
        people,
        name,
        "SELECT needs_check, next_fire_at, next_occurrence::text, last_occurrence::text "
        "FROM reminder_schedule WHERE reminder_id = %s",
        reminder_id,
    )
    return rows[0]


def _reminder_notifications(people: People, headers: dict[str, str]) -> list[dict[str, Any]]:
    response = people.api.get("/api/v1/notifications", headers=headers)
    assert response.status_code == 200, response.text
    return [n for n in response.json()["data"] if n["kind"] == "reminder"]


def utc(year: int, month: int, day: int, hour: int = 0, minute: int = 0) -> datetime:
    return datetime(year, month, day, hour, minute, tzinfo=UTC)


@pytest.mark.db
def test_owner_only_one_form_at_most_five_and_soft_delete(people: People) -> None:
    ada = people.as_("ada")
    event = _event(people, ada)
    created = _reminder(people, ada, event, offset_minutes=15)
    assert created["status"] == "applied" and created["version"] == 1
    on_day = _reminder(people, ada, event, all_day_time="09:00", all_day_days_before=1)
    pulled = {
        c["entity_id"]: c["data"] for c in _pull(people.api)["changes"] if c["entity_type"] == "reminder"
    }
    assert pulled[on_day["id"]]["all_day_time"] == "09:00" and pulled[created["id"]]["offset_minutes"] == 15

    for form in (
        {},
        {"offset_minutes": 5, "all_day_time": "08:00", "all_day_days_before": 0},
        {"all_day_time": "08:00"},
    ):
        refused = _reminder(people, ada, event, **form)
        assert refused["status"] == "rejected" and refused["problem"]["status"] == 422, (form, refused)
    for minutes in (30, 60, 120):
        assert _reminder(people, ada, event, offset_minutes=minutes)["status"] == "applied"
    sixth = _reminder(people, ada, event, offset_minutes=240)
    assert sixth["status"] == "rejected" and "At most 5" in sixth["problem"]["detail"]

    changed = _push(
        people.api,
        ada,
        _m("reminder", created["id"], "update", base={"offset_minutes": 15}, data={"offset_minutes": 10}),
    )[0]
    assert changed["status"] == "applied" and changed["version"] == 2
    stale = _push(
        people.api,
        ada,
        _m("reminder", created["id"], "update", base={"offset_minutes": 15}, data={"offset_minutes": 5}),
    )[0]
    assert stale["status"] == "conflict" and stale["fields"] == ["offset_minutes"]

    assert _push(people.api, ada, _m("reminder", created["id"], "delete"))[0]["status"] == "applied"
    assert _reminder(people, ada, event, offset_minutes=240)["status"] == "applied"  # a place became free
    assert _as(people, "ada", "SELECT deleted_at IS NOT NULL FROM reminder WHERE id = %s", created["id"]) == [
        (True,)
    ]  # soft
    restored = _push(people.api, ada, _m("reminder", created["id"], "restore"))[0]
    assert restored["status"] == "applied"


@pytest.mark.db
def test_personal_on_shared_events_and_nothing_without_access(people: People) -> None:
    ada = people.as_("ada")
    event = _event(people, ada)
    assert people.share(ada, "bob@example.org", "view").status_code == 201
    theirs = _reminder(people, ada, event, offset_minutes=15)
    # The test client holds one session: logging in as someone else switches it.
    bob = people.as_("bob")
    mine = _reminder(people, bob, event, offset_minutes=30)
    assert mine["status"] == "applied"  # viewing is enough for one's own reminder

    bob_sees = [c["entity_id"] for c in _pull(people.api)["changes"] if c["entity_type"] == "reminder"]
    assert bob_sees == [mine["id"]]
    touched = _push(people.api, bob, _m("reminder", theirs["id"], "delete"))[0]
    assert touched["status"] == "rejected" and touched["problem"]["status"] == 404

    cid = people.as_("cid")
    stranger = _reminder(people, cid, event, offset_minutes=15)
    assert stranger["status"] == "rejected" and stranger["problem"]["status"] == 404


@pytest.mark.db
def test_the_worker_schedules_fires_once_and_follows_changes(people: People) -> None:
    ada = people.as_("ada")
    event = _event(people, ada)  # 10 November 11:00 Berlin = 10:00 UTC
    reminder = _reminder(people, ada, event, offset_minutes=15)

    assert _run(people, utc(2026, 11, 1)) == {"checked": 1}
    assert _schedule(people, "ada", reminder["id"]) == (False, utc(2026, 11, 10, 9, 45), "2026-11-10", None)
    assert _run(people, utc(2026, 11, 10, 9, 0)) == {}  # nothing due yet

    assert _run(people, utc(2026, 11, 10, 9, 45)) == {"fired": 1}
    [note] = _reminder_notifications(people, ada)
    assert note["payload"]["title"] == "Dentist" and note["payload"]["occurrence_date"] == "2026-11-10"
    assert note["payload"]["start_time"] == "11:00" and note["payload"]["late"] is False
    assert _schedule(people, "ada", reminder["id"]) == (False, None, None, "2026-11-10")
    assert _run(people, utc(2026, 11, 10, 9, 50)) == {}  # once

    # The event moves to the next day: the reminder is checked again and fires for the new date.
    moved = _push(
        people.api,
        ada,
        _m(
            "item",
            event,
            "update",
            base={"start_date": "2026-11-10", "end_date": "2026-11-10"},
            data={"start_date": "2026-11-11", "end_date": "2026-11-11"},
        ),
    )[0]
    assert moved["status"] == "applied", moved
    assert _schedule(people, "ada", reminder["id"])[0] is True
    assert _run(people, utc(2026, 11, 10, 10)) == {"checked": 1}
    assert _schedule(people, "ada", reminder["id"])[1:3] == (utc(2026, 11, 11, 9, 45), "2026-11-11")


@pytest.mark.db
def test_a_series_moves_on_late_fires_say_so_and_lost_access_stops(people: People, owner_db_url: str) -> None:
    ada = people.as_("ada")
    series = _event(people, ada, rrule="FREQ=DAILY", start_date="2026-11-02", end_date="2026-11-02")
    assert people.share(ada, "bob@example.org", "view").status_code == 201
    bob = people.as_("bob")
    reminder = _reminder(people, bob, series, all_day_time="08:00", all_day_days_before=0)
    sql_maintenance(
        owner_db_url, "UPDATE user_account SET time_zone = 'UTC' WHERE id = %s", people.ids["bob"]
    )

    _run(people, utc(2026, 11, 3, 9))
    assert _schedule(people, "bob", reminder["id"])[1:3] == (utc(2026, 11, 4, 8), "2026-11-04")
    # The server was down for two days: one late reminder, then the next one after now.
    assert _run(people, utc(2026, 11, 6, 12)) == {"fired_late": 1}
    [note] = _reminder_notifications(people, bob)
    assert note["payload"]["late"] is True and note["payload"]["occurrence_date"] == "2026-11-04"
    assert _schedule(people, "bob", reminder["id"])[1:] == (utc(2026, 11, 7, 8), "2026-11-07", "2026-11-04")

    # An excluded date is skipped.
    ada = people.as_("ada")
    assert (
        _push(people.api, ada, _m("item", series, "exclude", data={"occurrence_date": "2026-11-07"}))[0][
            "status"
        ]
        == "applied"
    )
    _run(people, utc(2026, 11, 6, 13))
    assert _schedule(people, "bob", reminder["id"])[2] == "2026-11-08"

    # Ada stops sharing: Bob's reminder no longer fires (it is kept).
    share_id = _as(people, "ada", "SELECT id FROM share")[0][0]
    assert people.api.delete(f"/api/v1/shares/{share_id}", headers=ada).status_code in (200, 204)
    assert _run(people, utc(2026, 11, 6, 14)) == {"idle": 1}
    assert _schedule(people, "bob", reminder["id"])[1] is None
    assert _run(people, utc(2026, 11, 8, 9)) == {}


# +++===+++ 2026-10-29 — Hasan Alizada — HAAL-172. The first check of a reminder may land in the very minute it is due.
@pytest.mark.db
def test_a_reminder_due_in_the_minute_of_its_first_check_fires_at_once(people: People) -> None:
    ada = people.as_("ada")
    event = _event(people, ada)  # 10 November 11:00 Berlin = 10:00 UTC
    at_start = _reminder(people, ada, event, offset_minutes=0)
    passed = _reminder(people, ada, event, offset_minutes=15)  # 09:45 UTC: before this minute
    just_after = utc(2026, 11, 10, 10) + timedelta(seconds=0.5)
    assert _run(people, just_after) == {"fired": 1, "checked": 1}
    [note] = _reminder_notifications(people, ada)
    assert note["payload"]["reminder_id"] == at_start["id"] and note["payload"]["late"] is False
    assert _schedule(people, "ada", at_start["id"]) == (False, None, None, "2026-11-10")
    assert _schedule(people, "ada", passed["id"]) == (False, None, None, None)

    # The event moves so that a reminder lands in the minute of the check: it fires in that round.
    moved = _push(
        people.api,
        ada,
        _m(
            "item",
            event,
            "update",
            base={"start_date": "2026-11-10", "end_date": "2026-11-10"},
            data={"start_date": "2026-11-11", "end_date": "2026-11-11"},
        ),
    )[0]
    assert moved["status"] == "applied", moved
    assert _run(people, utc(2026, 11, 11, 9, 45) + timedelta(seconds=20)) == {"fired": 1, "checked": 1}
    fired = sorted(n["payload"]["reminder_id"] for n in _reminder_notifications(people, ada))
    assert fired == sorted([at_start["id"], passed["id"]])
