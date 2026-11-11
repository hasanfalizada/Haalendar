"""Card assignees (FR-KAN-10, D-97): members of a board (its owner and active shares) are assigned to its cards by the
owner and edit shares; the same person twice, someone outside the board and a view share's write are refused; the
assignee is told (not when assigning oneself); the members are listed with names for every reader of the board; a
revoked member is listed no more and cannot be assigned again; assignees go to the trash and come back with their card.
Marker `db`.

+++===+++ 2026-10-30 — Hasan Alizada — HAAL-119.
"""

from __future__ import annotations

import uuid
from typing import Any

import pytest
from fastapi.testclient import TestClient

from .test_boards import _update as _board_update
from .test_cards import _board_with_columns, _card, _pulled, _restore
from .test_notes import _create as _note
from .test_sharing import People
from .test_sync import _m, _push


@pytest.fixture
def people(api: TestClient, clean_db: str) -> People:
    return People(api, clean_db)


def _assign(people: People, headers: dict[str, str], card: str, user: str) -> dict[str, Any]:
    row = str(uuid.uuid7())
    result = _push(
        people.api, headers, _m("card_assignee", row, "create", data={"item_id": card, "user_id": user})
    )
    return {"id": row, **result[0]}


def _members(people: People, board: str) -> Any:
    return people.api.get(f"/api/v1/boards/{board}/members")


def _assigned(people: People, headers: dict[str, str]) -> list[dict[str, Any]]:
    response = people.api.get("/api/v1/notifications", headers=headers)
    assert response.status_code == 200, response.text
    return [n for n in response.json()["data"] if n["kind"] == "assigned"]


def _shared(people: People, headers: dict[str, str], board: str) -> dict[str, str]:
    """Bob views and Cid edits the board; their share ids."""
    ids = {}
    for name, permission in (("bob", "view"), ("cid", "edit")):
        response = people.share(
            headers, f"{name}@example.org", permission, container_kind="board", container_id=board
        )
        assert response.status_code == 201, response.text
        ids[name] = response.json()["id"]
    return ids


@pytest.mark.db
def test_members_are_assigned_by_writers_and_told(people: People) -> None:
    ada = people.as_("ada")
    board, todo, _ = _board_with_columns(people, ada)
    card, _ = _card(people, ada, board, todo, title="Plan release")
    # Unshared: only the owner is a member.
    assert _assign(people, ada, card, people.ids["bob"])["problem"]["status"] == 422
    _shared(people, ada, board)

    listed = _members(people, board)
    assert listed.status_code == 200, listed.text
    assert [(m["display_name"], m["permission"]) for m in listed.json()["data"]] == [
        ("Ada", "owner"),
        ("Bob", "view"),
        ("Cid", "edit"),
    ]
    bob_assigned = _assign(people, ada, card, people.ids["bob"])
    assert bob_assigned["status"] == "applied", bob_assigned
    assert _assign(people, ada, card, people.ids["ada"])["status"] == "applied"
    twice = _assign(people, ada, card, people.ids["bob"])
    assert twice["status"] == "rejected" and twice["problem"]["status"] == 409, twice
    note, _ = _note(people, ada)
    assert _assign(people, ada, note, people.ids["ada"])["problem"]["status"] == 422
    assert _assign(people, ada, str(uuid.uuid7()), people.ids["ada"])["problem"]["status"] == 404
    assert _pulled(people, "card_assignee")[bob_assigned["id"]]["user_id"] == people.ids["bob"]

    # Bob, a view share, sees the members and his assignment, is told, but assigns nobody.
    bob = people.as_("bob")
    assert [m["permission"] for m in _members(people, board).json()["data"]] == ["owner", "view", "edit"]
    assert {row["user_id"] for row in _pulled(people, "card_assignee").values()} == {
        people.ids["ada"],
        people.ids["bob"],
    }
    [told] = _assigned(people, bob)
    assert told["item_id"] == card
    assert {k: told["payload"][k] for k in ("title", "board_id", "board_name", "by_name")} == {
        "title": "Plan release",
        "board_id": board,
        "board_name": "Revamp",
        "by_name": "Ada",
    }
    assert _assign(people, bob, card, people.ids["bob"])["problem"]["status"] == 403

    # Cid, an edit share, assigns himself (nobody is told) and removes Bob.
    cid = people.as_("cid")
    assert _assign(people, cid, card, people.ids["cid"])["status"] == "applied"
    assert _assigned(people, cid) == []
    removed = _push(people.api, cid, _m("card_assignee", bob_assigned["id"], "delete"))[0]
    assert removed["status"] == "applied", removed
    assert _pulled(people, "card_assignee")[bob_assigned["id"]]["deleted_at"] is not None
    restored = _push(people.api, cid, _m("card_assignee", bob_assigned["id"], "restore"))[0]
    assert restored["status"] == "applied", restored
    assert len(_assigned(people, people.as_("bob"))) == 1  # a restore tells nobody

    # On an archived board nothing is assigned.
    ada = people.as_("ada")
    assert (
        _board_update(people, ada, board, {"archived_at": None}, {"archived_at": "2026-11-01T00:00:00Z"})[
            "status"
        ]
        == "applied"
    )
    archived = _assign(people, ada, card, people.ids["cid"])
    assert archived["problem"]["status"] == 409, archived


@pytest.mark.db
def test_revoked_members_leave_and_assignees_follow_their_card_to_the_trash(people: People) -> None:
    ada = people.as_("ada")
    board, todo, _ = _board_with_columns(people, ada)
    card, _ = _card(people, ada, board, todo)
    shares = _shared(people, ada, board)
    bob_row = _assign(people, ada, card, people.ids["bob"])
    assert bob_row["status"] == "applied"
    removed = _push(people.api, ada, _m("card_assignee", bob_row["id"], "delete"))[0]
    assert removed["status"] == "applied"

    # Bob's share revoked: no longer a member, not assignable, his removed assignment not restorable.
    assert people.api.delete(f"/api/v1/shares/{shares['bob']}", headers=ada).status_code == 204
    assert [m["display_name"] for m in _members(people, board).json()["data"]] == ["Ada", "Cid"]
    assert _assign(people, ada, card, people.ids["bob"])["problem"]["status"] == 422
    again = _push(people.api, ada, _m("card_assignee", bob_row["id"], "restore"))[0]
    assert again["status"] == "rejected" and again["problem"]["status"] == 422, again
    assert _members(people, board).status_code == 200
    assert _members(people, str(uuid.uuid7())).status_code == 404
    people.as_("bob")
    assert _members(people, board).status_code == 404

    # The card's delete takes its assignees into its batch; the trash brings them back.
    ada = people.as_("ada")
    cid_row = _assign(people, ada, card, people.ids["cid"])
    assert _push(people.api, ada, _m("item", card, "delete"))[0]["status"] == "applied"
    assert _pulled(people, "card_assignee")[cid_row["id"]]["deleted_at"] is not None
    entries = people.api.get("/api/v1/trash", headers=ada).json()["data"]
    [entry] = [e for e in entries if e["id"] == card]
    assert entry["contents"].get("card_assignee") == 1
    _restore(people, ada, "card", card)
    assert _pulled(people, "card_assignee")[cid_row["id"]]["deleted_at"] is None
