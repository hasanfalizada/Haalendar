"""Converting an item to another kind in place (FR-INT-02, D-125): the same id keeps links, attachments and history;
dates, places and checklists are carried over; what the new kind has no place for goes in one batch that an undo brings
back; the rights and the refusals. Marker `db`.

+++===+++ 2026-11-25 13:10 +04 — Hasan Alizada — HAAL-122.
"""

from __future__ import annotations

import uuid
from typing import Any

import pytest
from fastapi.testclient import TestClient

from .test_attachments import png
from .test_card_assignees import _assign, _shared
from .test_cards import _board_with_columns, _card, _pulled
from .test_checklists import _add
from .test_comments import _comment
from .test_events import _create as _event
from .test_isolation import as_user
from .test_links import _link
from .test_note_labels import _label, _put
from .test_notes import _create as _note
from .test_reminders import _reminder
from .test_sharing import People
from .test_sync import _m, _push


@pytest.fixture
def people(api: TestClient, clean_db: str) -> People:
    return People(api, clean_db)


def _convert(people: People, headers: dict[str, str], item: str, **body: Any) -> Any:
    return people.api.post(f"/api/v1/items/{item}/convert", json=body, headers=headers)


def _ok(people: People, headers: dict[str, str], item: str, **body: Any) -> dict[str, Any]:
    response = _convert(people, headers, item, **body)
    assert response.status_code == 200, response.text
    result: dict[str, Any] = response.json()
    return result


def _live(people: People, table: str, item: str, column: str = "item_id") -> list[tuple[Any, ...]]:
    with as_user(people.db_url, uuid.UUID(people.ids["ada"])) as conn:
        rows = conn.execute(
            f"SELECT id::text, container_kind, container_id::text FROM {table} "  # noqa: S608 — test tables
            f"WHERE {column} = %s AND deleted_at IS NULL ORDER BY id",
            (item,),
        ).fetchall()
    return [tuple(row) for row in rows]


@pytest.mark.db
def test_an_event_becomes_a_card_keeping_links_files_and_reminders_and_undo_brings_it_back(
    people: People,
) -> None:
    ada = people.as_("ada")
    board, todo, _ = _board_with_columns(people, ada)
    event, created = _event(
        people,
        ada,
        title="Dentist",
        body="Bring the card",
        all_day=False,
        start_date="2026-12-03",
        start_time="09:30",
        end_date="2026-12-03",
        end_time="10:15",
        location="Main street 5",
        color="red",
        priority="high",
    )
    assert created["status"] == "applied", created
    note, _ = _note(people, ada)
    link = _link(people, ada, event, note)
    assert link["status"] == "applied", link
    uploaded = people.api.post(
        f"/api/v1/items/{event}/attachments",
        content=png(),
        headers={**ada, "Content-Type": "image/png", "X-File-Name": "x.png"},
    )
    assert uploaded.status_code == 201, uploaded.text
    timed = _reminder(people, ada, event, offset_minutes=30)
    assert timed["status"] == "applied", timed
    version = _pulled(people, "item")[event]["version"]

    done = _ok(
        people, ada, event, target_kind="card", board_id=board, column_id=todo, position="a", version=version
    )
    assert (done["item_id"], done["kind"], done["version"]) == (event, "card", version + 1)
    row = _pulled(people, "item")[event]
    assert (row["kind"], row["container_kind"], row["container_id"]) == ("card", "board", board)
    assert (row["title"], row["color"], row["priority"]) == ("Dentist", "red", "high")
    assert row["body"] == "Location: Main street 5\n\nBring the card"
    assert (row["column_id"], row["position"], row["due_date"], row["due_time"]) == (
        todo,
        "a",
        "2026-12-03",
        "09:30",
    )
    assert "start_date" not in row and "location" not in row  # only the details of its kind travel
    moved = _pulled(people, "link")[link["id"]]
    assert (moved["container_kind"], moved["container_id"], moved["to_item_id"]) == ("board", board, note)
    assert [row[1:] for row in _live(people, "attachment", event)] == [("board", board)]
    assert (
        _pulled(people, "reminder")[timed["id"]]["deleted_at"] is None
    )  # the form counts from the due date too

    # Undo: the event as it was, in its calendar, with its own times and place again.
    back = _ok(
        people,
        ada,
        event,
        target_kind="event",
        undo=done["batch_id"],
        title="Dentist",
        body="Bring the card",
    )
    assert back["kind"] == "event"
    row = _pulled(people, "item")[event]
    assert (row["container_kind"], row["container_id"]) == ("calendar", people.calendar)
    assert (row["start_date"], row["start_time"], row["end_time"], row["location"]) == (
        "2026-12-03",
        "09:30",
        "10:15",
        "Main street 5",
    )
    assert row["body"] == "Bring the card"
    assert "column_id" not in row and "due_date" not in row
    assert [row[1:] for row in _live(people, "attachment", event)] == [("calendar", people.calendar)]

    # A repeated request changes nothing.
    again = _ok(people, ada, event, target_kind="event")
    assert again["version"] == back["version"]


@pytest.mark.db
def test_a_note_carries_its_checklist_and_labels_to_a_card_and_to_an_event(people: People) -> None:
    ada = people.as_("ada")
    board, todo, _ = _board_with_columns(people, ada)
    note, _ = _note(people, ada, title="Groceries", body="For Sunday", due_date="2026-12-06")
    milk = _add(people, ada, note, "Milk", "a")
    _add(people, ada, note, "Bread", "b", checked=True)
    home, _ = _label(people, ada, "Home")
    errand, _ = _label(people, ada, "Errand")
    _put(people, ada, note, home)
    _put(people, ada, note, errand)
    on_board = str(uuid.uuid7())
    _push(
        people.api,
        ada,
        _m("label", on_board, "create", data={"board_id": board, "name": "home", "color": "red"}),
    )
    at = _reminder(people, ada, note, remind_at="2026-12-06T08:00:00+00:00")
    assert at["status"] == "applied", at

    card = _ok(people, ada, note, target_kind="card", board_id=board, column_id=todo, position="b")
    row = _pulled(people, "item")[note]
    assert (row["kind"], row["due_date"], row["due_time"], row["body"]) == (
        "card",
        "2026-12-06",
        None,
        "For Sunday",
    )
    assert [r[1:] for r in _live(people, "checklist_item", note)] == [("board", board)] * 2
    labels = _pulled(people, "item_label")
    live = sorted(r["label_id"] for r in labels.values() if r["item_id"] == note and r["deleted_at"] is None)
    assert live == [on_board]  # "Home" has a board label of that name, "Errand" has none
    assert (
        _pulled(people, "reminder")[at["id"]]["deleted_at"] is not None
    )  # a date and time: a note's form only

    event = _ok(people, ada, note, target_kind="event", calendar_id=people.calendar)
    row = _pulled(people, "item")[note]
    assert (row["kind"], row["all_day"], row["start_date"], row["end_date"]) == (
        "event",
        True,
        "2026-12-06",
        "2026-12-06",
    )
    assert row["body"] == "For Sunday\n\n- [ ] Milk\n- [x] Bread"
    assert _live(people, "checklist_item", note) == []
    assert [r["deleted_at"] for r in _pulled(people, "item_label").values() if r["item_id"] == note].count(
        None
    ) == 0

    # Undo of the second step: the card with its checklist and its board label again.
    _ok(people, ada, note, target_kind="card", undo=event["batch_id"], title="Groceries", body="For Sunday")
    row = _pulled(people, "item")[note]
    assert (row["kind"], row["column_id"], row["position"]) == ("card", todo, "b")
    assert milk in {r[0] for r in _live(people, "checklist_item", note)}
    labels = _pulled(people, "item_label")
    assert [r["label_id"] for r in labels.values() if r["item_id"] == note and r["deleted_at"] is None] == [
        on_board
    ]
    assert card["batch_id"] != event["batch_id"]


@pytest.mark.db
def test_a_card_becomes_a_note_without_its_assignees_and_comments_until_undone(people: People) -> None:
    ada = people.as_("ada")
    board, todo, _ = _board_with_columns(people, ada)
    card, _ = _card(people, ada, board, todo, title="Paint", due_date="2026-12-01", due_time="18:00")
    _shared(people, ada, board)  # Bob views, Cid edits
    assert _assign(people, ada, card, people.ids["cid"])["status"] == "applied"
    said = _comment(people, ada, card, "Blue?")
    assert said["status"] == "applied"

    done = _ok(people, ada, card, target_kind="note", position="c")
    row = _pulled(people, "item")[card]
    assert (row["kind"], row["container_kind"], row["container_id"]) == ("note", "note", card)
    assert (row["due_date"], row["due_time"], row["pinned"], row["is_checklist"]) == (
        "2026-12-01",
        "18:00",
        False,
        False,
    )
    assert _live(people, "card_assignee", card) == [] and _live(people, "comment", card) == []

    back = _ok(people, ada, card, target_kind="card", undo=done["batch_id"], title="Paint", body=None)
    row = _pulled(people, "item")[card]
    assert (row["kind"], row["column_id"], row["due_time"]) == ("card", todo, "18:00")
    assert len(_live(people, "card_assignee", card)) == 1
    assert [r[0] for r in _live(people, "comment", card)] == [said["id"]]
    # Converted to a note again later: the note details it had are found and made anew.
    again = _ok(people, ada, card, target_kind="note", position="d")
    assert _pulled(people, "item")[card]["position"] == "d"
    assert again["version"] > back["version"]


@pytest.mark.db
def test_rights_and_refusals(people: People) -> None:
    ada = people.as_("ada")
    board, todo, _ = _board_with_columns(people, ada)
    _shared(people, ada, board)  # Bob views, Cid edits
    card, _ = _card(people, ada, board, todo)
    series, _ = _event(people, ada, title="Gym", start_date="2026-12-01", rrule="FREQ=WEEKLY")
    long, _ = _card(people, ada, board, todo, title="x" * 180)
    note, _ = _note(people, ada, title="")

    assert (
        _convert(
            people, ada, series, target_kind="card", board_id=board, column_id=todo, position="a"
        ).status_code
        == 422
    )
    assert _convert(people, ada, card, target_kind="event").status_code == 422  # no calendar
    assert _convert(people, ada, card, target_kind="card", undo=str(uuid.uuid7())).status_code == 422
    assert (
        _convert(people, ada, card, target_kind="event", calendar_id=people.calendar, version=99).status_code
        == 409
    )
    assert (
        _convert(people, ada, card, target_kind="note", title="x").status_code == 422
    )  # title only with undo

    # A long title is cut for an event; an untitled note becomes a card "(No title)".
    _ok(people, ada, long, target_kind="event", calendar_id=people.calendar, start_date="2026-12-24")
    row = _pulled(people, "item")[long]
    assert (len(row["title"]), row["start_date"], row["all_day"]) == (150, "2026-12-24", True)
    _ok(people, ada, note, target_kind="card", board_id=board, column_id=todo, position="z")
    assert _pulled(people, "item")[note]["title"] == "(No title)"

    # A shared note is not converted.
    shared_note, _ = _note(people, ada, title="Together")
    response = people.share(ada, "bob@example.org", "view", container_kind="note", container_id=shared_note)
    assert response.status_code == 201, response.text
    assert (
        _convert(
            people, ada, shared_note, target_kind="card", board_id=board, column_id=todo, position="y"
        ).status_code
        == 409
    )

    # Bob only views the board; Cid edits it but may not make Ada's card his note, nor put it in Ada's calendar.
    bob = people.as_("bob")
    assert _convert(people, bob, card, target_kind="note", position="a").status_code == 403
    cid = people.as_("cid")
    assert _convert(people, cid, card, target_kind="note", position="a").status_code == 403
    assert _convert(people, cid, card, target_kind="event", calendar_id=people.calendar).status_code in (
        403,
        404,
    )


@pytest.mark.db
def test_details_left_where_the_user_cannot_change_them_answer_409(people: People) -> None:
    ada = people.as_("ada")
    board, todo, _ = _board_with_columns(people, ada)
    _shared(people, ada, board)  # Cid edits the board, not Ada's calendar
    event, _ = _event(people, ada, title="Talk", start_date="2026-12-10")
    _ok(people, ada, event, target_kind="card", board_id=board, column_id=todo, position="a")
    cid = people.as_("cid")
    [calendar] = [
        row["id"] for row in _pulled(people, "calendar").values() if row["owner_id"] == people.ids["cid"]
    ]
    response = _convert(people, cid, event, target_kind="event", calendar_id=calendar)
    assert response.status_code == 409, response.text
    assert (
        response.json()["detail"]
        == "It was an event somewhere you cannot change, so it cannot become one again"
    )
    assert _pulled(people, "item")[event]["kind"] == "card"  # nothing changed
