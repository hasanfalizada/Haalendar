"""Reminders on notes (FR-TODO-07, D-89): a date and time — the only form a note takes, and one an event does not —, at
most five per note and user; the worker fires it once (also for an archived note, also when the note was edited just
before, never for a deleted one), late ones say so, a time already passed when set does not fire; the notification and
Web Push name the note and open it on the To-Do page. Marker `db`.

+++===+++ 2026-10-29 — Hasan Alizada — HAAL-105.
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime, timedelta

import pytest
from fastapi.testclient import TestClient

from haalendar.planning.reminders import push_message

from .test_notes import _create
from .test_reminders import _event, _reminder, _reminder_notifications, _run, _schedule, utc
from .test_sharing import People
from .test_sync import _m, _pull, _push


@pytest.fixture
def people(api: TestClient, clean_db: str) -> People:
    return People(api, clean_db)


@pytest.mark.db
def test_a_note_takes_a_date_and_time_only(people: People) -> None:
    ada = people.as_("ada")
    note, _ = _create(people, ada)
    created = _reminder(people, ada, note, remind_at="2026-11-10T09:00:30+01:00")
    assert created["status"] == "applied", created
    [row] = [c["data"] for c in _pull(people.api)["changes"] if c["entity_id"] == created["id"]]
    assert row["remind_at"].startswith("2026-11-10T08:00:00") and row["offset_minutes"] is None

    for form in (
        {"offset_minutes": 15},
        {"all_day_time": "09:00", "all_day_days_before": 0},
        {},
        {"remind_at": "soon"},
    ):
        refused = _reminder(people, ada, note, **form)
        assert refused["status"] == "rejected" and refused["problem"]["status"] == 422, (form, refused)
    naive = _reminder(people, ada, note, remind_at="2026-11-10T09:00:00")
    assert naive["status"] == "rejected"
    event = _event(people, ada)
    assert _reminder(people, ada, event, remind_at="2026-11-10T09:00:00Z")["status"] == "rejected"
    for hour in (10, 11, 12, 13):
        assert _reminder(people, ada, note, remind_at=f"2026-11-10T{hour}:00:00Z")["status"] == "applied"
    sixth = _reminder(people, ada, note, remind_at="2026-11-10T14:00:00Z")
    assert sixth["status"] == "rejected" and "per note" in sixth["problem"]["detail"]

    changed = _push(
        people.api,
        ada,
        _m(
            "reminder",
            created["id"],
            "update",
            base={"remind_at": "2026-11-10T08:00:00Z"},
            data={"remind_at": "2026-11-10T08:30:00Z"},
        ),
    )[0]
    assert changed["status"] == "applied", changed

    # Bob neither sees Ada's note nor sets a reminder on it.
    bob = people.as_("bob")
    assert _reminder(people, bob, note, remind_at="2026-11-10T09:00:00Z")["problem"]["status"] == 404


@pytest.mark.db
def test_fires_once_also_archived_and_after_an_edit_never_deleted(people: People) -> None:
    ada = people.as_("ada")
    note, _ = _create(people, ada)
    reminder = _reminder(people, ada, note, remind_at="2026-11-10T08:00:00Z")
    assert _run(people, utc(2026, 11, 1)) == {"checked": 1}
    assert _schedule(people, "ada", reminder["id"])[:2] == (False, utc(2026, 11, 10, 8))

    # Archived, and its title edited just before the time (which asks for a check): it still fires, once.
    archive = _m(
        "item", note, "update", base={"archived_at": None}, data={"archived_at": "2026-11-01T00:00:00Z"}
    )
    rename = _m("item", note, "update", base={"title": "Shopping"}, data={"title": "Groceries"})
    assert [r["status"] for r in _push(people.api, ada, archive, rename)] == ["applied", "applied"]
    assert _schedule(people, "ada", reminder["id"])[0] is True
    assert _run(people, utc(2026, 11, 10, 8, 0)) == {"fired": 1}
    [fired] = _reminder_notifications(people, ada)
    assert fired["payload"]["kind"] == "note" and fired["payload"]["title"] == "Groceries"
    assert fired["payload"]["item_id"] == note and fired["payload"]["late"] is False
    assert _run(people, utc(2026, 11, 10, 8, 5)) == {}

    # Set again for later the same day: it fires again.
    again = _push(
        people.api,
        ada,
        _m(
            "reminder",
            reminder["id"],
            "update",
            base={"remind_at": "2026-11-10T08:00:00Z"},
            data={"remind_at": "2026-11-10T09:00:00Z"},
        ),
    )[0]
    assert again["status"] == "applied"
    assert _run(people, utc(2026, 11, 10, 8, 20)) == {"checked": 1}
    assert _schedule(people, "ada", reminder["id"])[1] == utc(2026, 11, 10, 9)
    assert _run(people, utc(2026, 11, 10, 9, 0)) == {"fired": 1}

    # Missed while the server was down: fires once, late. A deleted note's reminder never fires.
    late = _reminder(people, ada, note, remind_at="2026-11-12T08:00:00Z")
    gone_note, _ = _create(people, ada, title="Old")
    gone = _reminder(people, ada, gone_note, remind_at="2026-11-12T08:00:00Z")
    assert _run(people, utc(2026, 11, 11)) == {"checked": 2}
    assert _push(people.api, ada, _m("item", gone_note, "delete"))[0]["status"] == "applied"
    assert _run(people, utc(2026, 11, 12, 10)) == {"fired_late": 1, "idle": 1}
    titles = [(n["payload"]["title"], n["payload"]["late"]) for n in _reminder_notifications(people, ada)]
    assert sorted(titles) == [("Groceries", False), ("Groceries", False), ("Groceries", True)]
    assert _schedule(people, "ada", late["id"])[1] is None and _schedule(people, "ada", gone["id"])[1] is None


def test_push_message_of_a_note() -> None:
    payload = {
        "reminder_id": str(uuid.uuid7()),
        "item_id": "n1",
        "kind": "note",
        "title": "Shopping",
        "fire_at": "2026-11-10T08:00:00+00:00",
        "late": False,
    }
    message = push_message(
        payload, uuid.uuid7(), "Europe/Berlin", False, datetime(2026, 11, 10, 7, tzinfo=UTC)
    )
    assert (message["title"], message["body"], message["url"]) == (
        "Reminder: Shopping",
        "Today, 09:00",
        "/todo?note=n1",
    )
    twelve = push_message(
        {**payload, "title": ""}, uuid.uuid7(), "Europe/Berlin", True, datetime(2026, 11, 9, tzinfo=UTC)
    )
    assert (twelve["title"], twelve["body"]) == ("Reminder: Untitled note", "Tomorrow, 9:00 AM")


@pytest.mark.db
def test_a_time_passed_when_set_does_not_fire_but_the_first_check_at_its_minute_does(people: People) -> None:
    # Real clock here: "passed when set" is judged against the moment the reminder was written.
    ada = people.as_("ada")
    note, _ = _create(people, ada)
    now = datetime.now(UTC).replace(second=0, microsecond=0)
    passed = _reminder(people, ada, note, remind_at=(now - timedelta(minutes=10)).isoformat())
    this_minute = _reminder(people, ada, note, remind_at=now.isoformat())
    assert _run(people, now + timedelta(seconds=59)) == {"checked": 1, "fired": 1}
    assert _schedule(people, "ada", passed["id"])[1] is None
    [fired] = _reminder_notifications(people, ada)
    assert fired["payload"]["reminder_id"] == this_minute["id"]
