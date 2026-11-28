"""Card comments and the history of an item (FR-KAN-05, FR-X-03, D-123): the board's owner and edit shares comment, a
view share reads; only the author changes the text ("edited"), the author or the board's owner deletes and restores;
the text is checked; the assignees are told except the author; comments follow their card, column and board to the
trash and back and are exported; the history of an item gathers the records of the item and of what hangs off it,
newest first, in pages, for its readers only. Marker `db`.

+++===+++ 2026-11-24 17:41 +04 — Hasan Alizada — HAAL-114.
"""

from __future__ import annotations

import json
import uuid
from typing import Any

import psycopg
import pytest
from fastapi.testclient import TestClient

from haalendar.live.sql import CHANNEL

from .test_boards import _update as _board_update
from .test_card_assignees import _assign, _shared
from .test_cards import _board_with_columns, _card, _pulled, _restore
from .test_events import _create as _event
from .test_isolation import _dsn
from .test_notes import _create as _note
from .test_sharing import People
from .test_sync import _m, _push


@pytest.fixture
def people(api: TestClient, clean_db: str) -> People:
    return People(api, clean_db)


def _comment(people: People, headers: dict[str, str], card: str, body: str = "Looks good") -> dict[str, Any]:
    row = str(uuid.uuid7())
    result = _push(people.api, headers, _m("comment", row, "create", data={"item_id": card, "body": body}))
    return {"id": row, **result[0]}


def _edit(people: People, headers: dict[str, str], row: str, old: str, new: str) -> dict[str, Any]:
    result: dict[str, Any] = _push(
        people.api, headers, _m("comment", row, "update", base={"body": old}, data={"body": new})
    )[0]
    return result


def _op(people: People, headers: dict[str, str], row: str, op: str) -> dict[str, Any]:
    result: dict[str, Any] = _push(people.api, headers, _m("comment", row, op))[0]
    return result


def _told(people: People) -> list[dict[str, Any]]:
    response = people.api.get("/api/v1/notifications")
    assert response.status_code == 200, response.text
    return [n for n in response.json()["data"] if n["kind"] == "comment"]


def _history(people: People, item: str, **params: Any) -> Any:
    return people.api.get(f"/api/v1/items/{item}/history", params=params)


@pytest.mark.db
def test_writers_comment_authors_edit_owners_moderate_and_assignees_are_told(people: People) -> None:
    ada = people.as_("ada")
    board, todo, _ = _board_with_columns(people, ada)
    card, _ = _card(people, ada, board, todo, title="Paint the fence")
    _shared(people, ada, board)  # Bob views, Cid edits
    assert _assign(people, ada, card, people.ids["bob"])["status"] == "applied"
    assert _assign(people, ada, card, people.ids["cid"])["status"] == "applied"

    # Ada writes: Bob and Cid (assignees) are told, Ada is not.
    first = _comment(people, ada, card, "**Blue** or green?")
    assert first["status"] == "applied", first
    row = _pulled(people, "comment")[first["id"]]
    assert (row["item_id"], row["author_id"], row["body"], row["edited_at"]) == (
        card,
        people.ids["ada"],
        "**Blue** or green?",
        None,
    )
    assert _told(people) == []
    bob = people.as_("bob")
    [told] = _told(people)
    assert told["item_id"] == card
    assert {k: told["payload"][k] for k in ("comment_id", "title", "board_id", "board_name", "by_name")} == {
        "comment_id": first["id"],
        "title": "Paint the fence",
        "board_id": board,
        "board_name": "Revamp",
        "by_name": "Ada",
    }
    assert "body" not in told["payload"]

    # Bob, a view share, reads but neither writes nor deletes.
    assert first["id"] in _pulled(people, "comment")
    assert _comment(people, bob, card)["problem"]["status"] == 403
    assert _op(people, bob, first["id"], "delete")["problem"]["status"] == 403

    # Cid, an edit share, writes; only Ada's own text is Ada's to change.
    cid = people.as_("cid")
    second = _comment(people, cid, card, "Green")
    assert second["status"] == "applied", second
    assert _edit(people, cid, first["id"], "**Blue** or green?", "Hacked")["problem"]["status"] == 403
    assert _op(people, cid, first["id"], "delete")["problem"]["status"] == 403
    edited = _edit(people, cid, second["id"], "Green", "Green, dark")
    assert edited["status"] == "applied", edited
    assert _pulled(people, "comment")[second["id"]]["edited_at"] is not None
    assert len(_told(people)) == 1  # Ada's comment only, not his own

    # Ada, the board's owner, deletes Cid's comment and puts it back; Cid deletes his own.
    ada = people.as_("ada")
    assert _op(people, ada, second["id"], "delete")["status"] == "applied"
    assert _pulled(people, "comment")[second["id"]]["deleted_at"] is not None
    assert _edit(people, ada, first["id"], "**Blue** or green?", "Blue")["status"] == "applied"
    assert _op(people, ada, second["id"], "restore")["status"] == "applied"
    assert _pulled(people, "comment")[second["id"]]["deleted_at"] is None
    cid = people.as_("cid")
    assert _op(people, cid, second["id"], "delete")["status"] == "applied"
    people.as_("bob")
    assert len(_told(people)) == 2  # Ada's and Cid's comments; a restore told nobody


@pytest.mark.db
def test_the_text_and_the_card_are_checked(people: People) -> None:
    ada = people.as_("ada")
    board, todo, _ = _board_with_columns(people, ada)
    card, _ = _card(people, ada, board, todo)
    for body in ("", "   \n ", "x" * 10_001):
        rejected = _comment(people, ada, card, body)
        assert rejected["status"] == "rejected" and rejected["problem"]["status"] == 422, (body[:5], rejected)
    assert _comment(people, ada, card, "  kept as typed\n")["status"] == "applied"
    assert "  kept as typed\n" in [row["body"] for row in _pulled(people, "comment").values()]
    assert _comment(people, ada, card, "x" * 10_000)["status"] == "applied"
    note, _ = _note(people, ada)
    assert _comment(people, ada, note)["problem"]["status"] == 422
    assert _comment(people, ada, str(uuid.uuid7()))["problem"]["status"] == 404
    taken = _comment(people, ada, card)
    again = _push(
        people.api, ada, _m("comment", taken["id"], "create", data={"item_id": card, "body": "Again"})
    )[0]
    assert again["problem"]["status"] == 409
    blank = _edit(people, ada, taken["id"], "Looks good", " ")
    assert blank["problem"]["status"] == 422, blank

    # Bob reads nothing of the board (not shared).
    bob = people.as_("bob")
    assert _comment(people, bob, card)["problem"]["status"] == 404

    # On an archived board nothing is written.
    ada = people.as_("ada")
    archived = _board_update(
        people, ada, board, {"archived_at": None}, {"archived_at": "2026-11-01T00:00:00Z"}
    )
    assert archived["status"] == "applied"
    assert _comment(people, ada, card)["problem"]["status"] == 409


@pytest.mark.db
def test_comments_follow_their_card_column_and_board_to_the_trash_and_back(people: People) -> None:
    ada = people.as_("ada")
    board, todo, _ = _board_with_columns(people, ada)
    card, _ = _card(people, ada, board, todo)
    kept = _comment(people, ada, card)["id"]

    # A card's delete takes its comments along; restoring it brings them back; one comment cannot come back alone.
    assert _push(people.api, ada, _m("item", card, "delete"))[0]["status"] == "applied"
    assert _pulled(people, "comment")[kept]["deleted_at"] is not None
    assert _op(people, ada, kept, "restore")["problem"]["status"] == 409
    trash = people.api.get("/api/v1/trash").json()["data"]
    assert [entry["contents"] for entry in trash if entry["id"] == card] == [{"comment": 1}]
    assert _restore(people, ada, "card", card)["restored"] == 1
    assert _pulled(people, "comment")[kept]["deleted_at"] is None

    # So do its column's and its board's.
    assert _push(people.api, ada, _m("board_column", todo, "delete"))[0]["status"] == "applied"
    assert _pulled(people, "comment")[kept]["deleted_at"] is not None
    assert _restore(people, ada, "column", todo)["restored"] == 1
    assert _pulled(people, "comment")[kept]["deleted_at"] is None
    assert _push(people.api, ada, _m("board", board, "delete"))[0]["status"] == "applied"
    assert _pulled(people, "comment")[kept]["deleted_at"] is not None
    assert _restore(people, ada, "board", board)["restored"] == 1
    assert _pulled(people, "comment")[kept]["deleted_at"] is None


@pytest.mark.db
def test_the_history_of_an_item_gathers_what_hangs_off_it(people: People) -> None:
    ada = people.as_("ada")
    board, todo, done = _board_with_columns(people, ada)
    card, _ = _card(people, ada, board, todo, title="Paint")
    other, _ = _card(people, ada, board, todo, title="Other")
    _shared(people, ada, board)
    checklist = str(uuid.uuid7())
    item_check = {"item_id": card, "text": "Buy paint", "position": "U"}
    assert (
        _push(people.api, ada, _m("checklist_item", checklist, "create", data=item_check))[0]["status"]
        == "applied"
    )
    assert _assign(people, ada, card, people.ids["bob"])["status"] == "applied"
    comment = _comment(people, ada, card, "Started")["id"]
    moved = _push(
        people.api,
        ada,
        _m(
            "item",
            card,
            "update",
            base={"column_id": todo, "position": "U"},
            data={"column_id": done, "position": "U"},
        ),
    )[0]
    assert moved["status"] == "applied", moved
    _comment(people, ada, other, "Not this one")

    response = _history(people, card)
    assert response.status_code == 200, response.text
    records = response.json()["data"]
    assert response.json()["next_cursor"] is None
    ids = [r["id"] for r in records]
    assert ids == sorted(ids, reverse=True)  # newest first
    kinds = [(r["entity_type"], r["action"]) for r in records]
    assert kinds[0] == ("card", "move") and records[0]["after"]["column_id"] == done
    for expected in (
        ("item", "create"),
        ("card", "create"),
        ("checklist_item", "create"),
        ("card_assignee", "create"),
        ("comment", "create"),
    ):
        assert expected in kinds, (expected, kinds)
    assert all(
        r["entity_id"] in (card, checklist, comment) or r["entity_type"] == "card_assignee" for r in records
    )
    assert {r["actor_name"] for r in records} == {"Ada"}

    # In pages.
    first = _history(people, card, limit=2).json()
    assert len(first["data"]) == 2 and first["next_cursor"]
    rest = _history(people, card, cursor=first["next_cursor"], limit=200).json()
    assert [r["id"] for r in first["data"] + rest["data"]] == ids

    # Bob reads the board, so its history; a card of a board not shared with him is not found.
    ada = people.as_("ada")
    private, column, _ = _board_with_columns(people, ada)
    hidden, _ = _card(people, ada, private, column)
    people.as_("bob")
    assert [r["id"] for r in _history(people, card).json()["data"]] == ids
    assert _history(people, hidden).status_code == 404
    assert _history(people, str(uuid.uuid7())).status_code == 404


@pytest.mark.db
def test_the_history_of_an_event_and_of_a_note(people: People) -> None:
    ada = people.as_("ada")
    note, _ = _note(people, ada)
    event, created = _event(people, ada, title="Dentist", start_date="2026-12-01", end_date="2026-12-01")
    assert created["status"] == "applied", created
    renamed = _push(
        people.api, ada, _m("item", event, "update", base={"title": "Dentist"}, data={"title": "Doctor"})
    )
    assert renamed[0]["status"] == "applied", renamed
    for item, kind in ((note, "note"), (event, "event")):
        response = _history(people, item)
        assert response.status_code == 200, response.text
        kinds = [(r["entity_type"], r["action"]) for r in response.json()["data"]]
        assert ("item", "create") in kinds and (kind, "create") in kinds, kinds
    newest = _history(people, event).json()["data"][0]
    assert (newest["before"], newest["after"]) == ({"title": "Dentist"}, {"title": "Doctor"})


@pytest.mark.db
def test_a_comment_is_told_to_the_boards_audience(people: People, clean_db: str) -> None:
    ada = people.as_("ada")
    board, todo, _ = _board_with_columns(people, ada)
    card, _ = _card(people, ada, board, todo)
    with psycopg.connect(_dsn(clean_db), autocommit=True) as listener:
        listener.execute(f"LISTEN {CHANNEL}")
        assert _comment(people, ada, card)["status"] == "applied"
        messages = [json.loads(n.payload) for n in listener.notifies(timeout=1, stop_after=None)]
    assert {"c": "board", "i": board} in messages
