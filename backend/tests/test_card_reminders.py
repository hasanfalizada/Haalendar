"""Reminders on cards (FR-KAN-07, D-94): the two forms of an event, counted from the card's due date (with its time in
the board owner's zone, without one as a whole day), only while the card has a due date, set by anyone who reads the
board; fired once per due date — again when the due date moves to another day —, never for a deleted card, an archived
column or board; the notification and Web Push name the card and its board and open the card. Marker `db`.

+++===+++ 2026-10-30 — Hasan Alizada — HAAL-116.
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime

import pytest
from fastapi.testclient import TestClient

from haalendar.planning.reminders import push_message

from .account_helpers import sql_maintenance
from .test_boards import _update as _board_update
from .test_cards import _board_with_columns, _card, _edit
from .test_columns import _update as _column_update
from .test_reminders import _reminder, _reminder_notifications, _run, _schedule, utc
from .test_sharing import People
from .test_sync import _m, _push


@pytest.fixture
def people(api: TestClient, clean_db: str) -> People:
    return People(api, clean_db)


ARCHIVED = {"archived_at": "2026-11-01T00:00:00Z"}
LIVE = {"archived_at": None}


@pytest.mark.db
def test_a_card_takes_an_events_forms_once_it_has_a_due_date(people: People) -> None:
    ada = people.as_("ada")
    board, todo, _ = _board_with_columns(people, ada)
    card, _ = _card(people, ada, board, todo)
    undated = _reminder(people, ada, card, offset_minutes=30)
    assert undated["status"] == "rejected" and undated["problem"]["status"] == 422, undated

    assert _edit(people, ada, card, {"due_date": None}, {"due_date": "2026-11-10"})["status"] == "applied"
    day_before = _reminder(people, ada, card, all_day_time="09:00", all_day_days_before=1)
    at_start = _reminder(people, ada, card, offset_minutes=0)
    assert day_before["status"] == at_start["status"] == "applied", (day_before, at_start)
    refused = _reminder(people, ada, card, remind_at="2026-11-10T09:00:00Z")
    assert refused["status"] == "rejected" and refused["problem"]["status"] == 422
    # A date alone is a whole day in the board owner's zone (Berlin): 09:00 the day before, and its 00:00.
    assert _run(people, utc(2026, 11, 1)) == {"checked": 2}
    assert _schedule(people, "ada", day_before["id"])[1] == utc(2026, 11, 9, 8)
    assert _schedule(people, "ada", at_start["id"])[1] == utc(2026, 11, 9, 23)

    # A view share sets its own; someone without access does not even find the card.
    assert (
        people.share(ada, "bob@example.org", "view", container_kind="board", container_id=board).status_code
        == 201
    )
    assert _reminder(people, people.as_("bob"), card, offset_minutes=15)["status"] == "applied"
    assert _reminder(people, people.as_("cid"), card, offset_minutes=15)["problem"]["status"] == 404


@pytest.mark.db
def test_fires_once_per_due_date_in_the_board_owners_zone_and_not_when_archived_or_gone(
    people: People, owner_db_url: str
) -> None:
    ada = people.as_("ada")
    board, todo, _ = _board_with_columns(people, ada)
    card, _ = _card(people, ada, board, todo, title="Plan release", due_date="2026-11-10", due_time="09:30")
    assert (
        people.share(ada, "bob@example.org", "view", container_kind="board", container_id=board).status_code
        == 201
    )
    sql_maintenance(
        owner_db_url, "UPDATE user_account SET time_zone = 'UTC' WHERE id = %s", people.ids["bob"]
    )
    theirs = _reminder(people, people.as_("bob"), card, offset_minutes=0)
    ada = people.as_("ada")  # one client: the last login is the session
    mine = _reminder(people, ada, card, offset_minutes=30)
    assert _run(people, utc(2026, 11, 1)) == {"checked": 2}
    # 09:30 in Berlin (the board owner's) is 08:30 UTC, also for Bob who lives in UTC.
    assert _schedule(people, "ada", mine["id"])[1] == utc(2026, 11, 10, 8)
    assert _schedule(people, "bob", theirs["id"])[1] == utc(2026, 11, 10, 8, 30)

    assert _run(people, utc(2026, 11, 10, 8)) == {"fired": 1}
    [fired] = _reminder_notifications(people, ada)
    payload = fired["payload"]
    assert (payload["kind"], payload["title"], payload["board_id"], payload["board_name"]) == (
        "card",
        "Plan release",
        board,
        "Revamp",
    )
    assert (payload["due_date"], payload["due_time"], payload["tzid"], payload["late"]) == (
        "2026-11-10",
        "09:30",
        "Europe/Berlin",
        False,
    )
    assert _run(people, utc(2026, 11, 10, 8, 30)) == {"fired": 1}
    assert _run(people, utc(2026, 11, 10, 8, 40)) == {}
    # Its title edited after firing asks for a check but does not fire again for the same due date.
    assert _edit(people, ada, card, {"title": "Plan release"}, {"title": "Release"})["status"] == "applied"
    assert _run(people, utc(2026, 11, 10, 9)) == {"checked": 2}
    assert _schedule(people, "ada", mine["id"])[1] is None

    # Moved to another day: it fires again there.
    moved = _edit(people, ada, card, {"due_date": "2026-11-10"}, {"due_date": "2026-11-12"})
    assert moved["status"] == "applied"
    assert _run(people, utc(2026, 11, 11)) == {"checked": 2}
    assert _schedule(people, "ada", mine["id"])[1] == utc(2026, 11, 12, 8)

    # An archived column or board keeps its cards' reminders silent until unarchived.
    assert _column_update(people, ada, todo, LIVE, ARCHIVED)["status"] == "applied"
    assert _run(people, utc(2026, 11, 11, 1)) == {"idle": 2}
    assert _column_update(people, ada, todo, ARCHIVED, LIVE)["status"] == "applied"
    assert _run(people, utc(2026, 11, 11, 2)) == {"checked": 2}
    assert _board_update(people, ada, board, LIVE, ARCHIVED)["status"] == "applied"
    assert _run(people, utc(2026, 11, 11, 3)) == {"idle": 2}
    assert _board_update(people, ada, board, ARCHIVED, LIVE)["status"] == "applied"
    assert _run(people, utc(2026, 11, 11, 4)) == {"checked": 2}
    assert _schedule(people, "bob", theirs["id"])[1] == utc(2026, 11, 12, 8, 30)

    # A cleared due date silences them; a deleted card too.
    cleared = _edit(people, ada, card, {"due_date": "2026-11-12"}, {"due_date": None})
    assert cleared["status"] == "applied"
    assert _run(people, utc(2026, 11, 11, 5)) == {"idle": 2}
    assert _edit(people, ada, card, {"due_date": None}, {"due_date": "2026-11-13"})["status"] == "applied"
    assert _push(people.api, ada, _m("item", card, "delete"))[0]["status"] == "applied"
    assert _run(people, utc(2026, 11, 13, 12)) == {"idle": 2}
    assert len(_reminder_notifications(people, ada)) == 1


def test_push_message_of_a_card() -> None:
    payload = {
        "reminder_id": str(uuid.uuid7()),
        "item_id": "c1",
        "kind": "card",
        "title": "Plan release",
        "board_id": "b1",
        "board_name": "Revamp",
        "due_date": "2026-11-10",
        "due_time": "09:30",
        "tzid": "Europe/Berlin",
        "fire_at": "2026-11-10T08:00:00+00:00",
        "late": False,
    }
    message = push_message(
        payload, uuid.uuid7(), "Europe/Berlin", False, datetime(2026, 11, 10, 8, tzinfo=UTC)
    )
    assert (message["title"], message["body"], message["url"]) == (
        "Reminder: Plan release",
        "Today, 09:30 · Revamp",
        "/kanban/b1?card=c1",
    )
    # In another zone the due time is the reader's; a date alone is that day.
    tokyo = push_message(payload, uuid.uuid7(), "Asia/Tokyo", True, datetime(2026, 11, 9, 8, tzinfo=UTC))
    assert tokyo["body"] == "Tomorrow, 5:30 PM · Revamp"
    whole_day = push_message(
        {**payload, "due_time": None}, uuid.uuid7(), "UTC", False, datetime(2026, 11, 1, tzinfo=UTC)
    )
    assert whole_day["body"] == "Tue, Nov 10 · Revamp"
