"""Links between items (FR-INT-01, D-98): two different live events, notes or cards are linked once per pair by
someone who reads both and may write one; whoever reads either end sees the link (the other end may stay closed to
them); whoever may write either end removes and restores it; an item's delete leaves its links alone; an event moved to
another calendar takes its links along (the export: test_exports). Marker `db`.

+++===+++ 2026-10-30 — Hasan Alizada — HAAL-120.
"""

from __future__ import annotations

import uuid
from typing import Any

import pytest
from fastapi.testclient import TestClient

from .test_boards import _create as _board
from .test_cards import _board_with_columns, _card, _pulled
from .test_notes import _create as _note
from .test_reminders import _event
from .test_sharing import People
from .test_sync import _m, _push


@pytest.fixture
def people(api: TestClient, clean_db: str) -> People:
    return People(api, clean_db)


def _link(people: People, headers: dict[str, str], first: str, second: str) -> dict[str, Any]:
    row = str(uuid.uuid7())
    result = _push(
        people.api, headers, _m("link", row, "create", data={"from_item_id": first, "to_item_id": second})
    )
    return {"id": row, **result[0]}


def _op(people: People, headers: dict[str, str], row: str, op: str) -> dict[str, Any]:
    return _push(people.api, headers, _m("link", row, op))[0]


@pytest.mark.db
def test_items_are_linked_once_and_the_link_outlives_a_delete(people: People) -> None:
    ada = people.as_("ada")
    note, _ = _note(people, ada)
    event = _event(people, ada)
    board, todo, _ = _board_with_columns(people, ada)
    card, _ = _card(people, ada, board, todo)
    linked = _link(people, ada, note, event)
    assert linked["status"] == "applied", linked
    row = _pulled(people, "link")[linked["id"]]
    assert (row["from_item_id"], row["to_item_id"], row["origin"]) == (note, event, "manual")
    assert (row["container_kind"], row["container_id"]) == ("note", note)
    assert (row["to_container_kind"], row["to_container_id"]) == ("calendar", people.calendar)
    assert _link(people, ada, event, note)["problem"]["status"] == 409  # the same pair the other way round
    assert _link(people, ada, note, note)["problem"]["status"] == 422
    assert _link(people, ada, note, str(uuid.uuid7()))["problem"]["status"] == 404
    other_board, _ = _board(people, ada, name="Other")
    assert _link(people, ada, note, other_board)["problem"]["status"] == 404  # a board is no item
    assert _link(people, ada, card, event)["status"] == "applied"

    # The note to the trash and back: its link stays live all along.
    assert _push(people.api, ada, _m("item", note, "delete"))[0]["status"] == "applied"
    assert _pulled(people, "link")[linked["id"]]["deleted_at"] is None
    assert _link(people, ada, note, card)["problem"]["status"] == 409  # a deleted item is not linked anew
    assert _push(people.api, ada, _m("item", note, "restore"))[0]["status"] == "applied"

    removed = _op(people, ada, linked["id"], "delete")
    assert removed["status"] == "applied"
    again = _link(people, ada, event, note)
    assert again["status"] == "applied"
    assert _op(people, ada, linked["id"], "restore")["problem"]["status"] == 409  # linked again meanwhile

    # An event moved to another calendar takes its links along.
    work = str(uuid.uuid7())
    _push(people.api, ada, _m("calendar", work, "create", data={"name": "Work"}))
    moved = _push(
        people.api,
        ada,
        _m(
            "item",
            event,
            "move",
            base={"container_kind": "calendar", "container_id": people.calendar},
            data={"container_kind": "calendar", "container_id": work},
        ),
    )[0]
    assert moved["status"] == "applied", moved
    row = _pulled(people, "link")[again["id"]]
    assert (row["container_kind"], row["container_id"]) == ("calendar", work)


@pytest.mark.db
def test_either_end_reads_the_link_and_one_writable_end_is_needed(people: People) -> None:
    ada = people.as_("ada")
    board, todo, _ = _board_with_columns(people, ada)
    card, _ = _card(people, ada, board, todo, title="Plan release")
    event = _event(people, ada)
    for kind, container in (("board", board), ("calendar", people.calendar)):
        shared = people.share(ada, "bob@example.org", "view", container_kind=kind, container_id=container)
        assert shared.status_code == 201, shared.text

    bob = people.as_("bob")
    mine, _ = _note(people, bob, title="My notes")
    # Bob reads Ada's card and writes his note: he may link them; both of Ada's he only views: he may not.
    linked = _link(people, bob, mine, card)
    assert linked["status"] == "applied", linked
    assert _link(people, bob, card, event)["problem"]["status"] == 403

    # Cid reads none of it.
    cid = people.as_("cid")
    assert _link(people, cid, card, event)["problem"]["status"] == 404
    assert linked["id"] not in _pulled(people, "link")
    assert _op(people, cid, linked["id"], "delete")["problem"]["status"] == 404

    # Ada sees the link through her card (Bob's note stays closed to her) and may remove and restore it.
    ada = people.as_("ada")
    assert _pulled(people, "link")[linked["id"]]["from_item_id"] == mine
    assert mine not in _pulled(people, "item")
    assert _op(people, ada, linked["id"], "delete")["status"] == "applied"
    assert _op(people, ada, linked["id"], "restore")["status"] == "applied"
