"""Kanban boards (FR-KAN-01, D-90): the owner creates, renames, archives and unarchives a board through sync; the name
is 1-100 characters, the position letters and digits; an archived board is read-only for everyone; a board is shared
like a calendar (the grantee pulls it, cannot change it, is told its name); delete takes its content into one batch,
the trash restores it for the owner only; the export lists the user's boards. Marker `db`.

+++===+++ 2026-10-29 — Hasan Alizada — HAAL-110.
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


def _create(people: People, headers: dict[str, str], **data: Any) -> tuple[str, dict[str, Any]]:
    board = str(uuid.uuid7())
    result = _push(
        people.api, headers, _m("board", board, "create", data={"name": "Revamp", "position": "U", **data})
    )[0]
    return board, result


def _update(
    people: People, headers: dict[str, str], board: str, base: dict[str, Any], data: dict[str, Any]
) -> Any:
    return _push(people.api, headers, _m("board", board, "update", base=base, data=data))[0]


def _card(people: People, board: str, title: str = "Plan") -> str:
    """A card row written straight to the database as Ada (cards arrive through sync with HAAL-112)."""
    card = str(uuid.uuid7())
    _as(
        people,
        "ada",
        "INSERT INTO item (id, kind, owner_id, container_kind, container_id, title) "
        "VALUES (%s, 'card', %s, 'board', %s, %s) RETURNING id",
        card,
        people.ids["ada"],
        board,
        title,
    )
    return card


@pytest.mark.db
def test_the_owner_creates_renames_and_archives_a_board(people: People) -> None:
    ada = people.as_("ada")
    board, created = _create(people, ada, name="  Revamp  ")
    assert created["status"] == "applied", created
    [row] = [c["data"] for c in _pull(people.api)["changes"] if c["entity_type"] == "board"]
    assert (row["name"], row["position"], row["archived_at"], row["owner_id"]) == (
        "Revamp",
        "U",
        None,
        people.ids["ada"],
    )
    assert "sync_xid" not in row and "sync_seq" not in row

    for data in ({"name": " "}, {"name": "x" * 101}, {"position": "a-b"}, {"position": ""}, {"color": "red"}):
        refused = _create(people, ada, **data)[1]
        assert refused["status"] == "rejected" and refused["problem"]["status"] == 422, (data, refused)
    again = _push(people.api, ada, _m("board", board, "create", data={"name": "Twice", "position": "V"}))[0]
    assert again["status"] == "rejected" and again["problem"]["status"] == 409

    renamed = _update(
        people, ada, board, {"name": "Revamp", "position": "U"}, {"name": "Kanban", "position": "W"}
    )
    assert renamed["status"] == "applied", renamed
    stale = _update(people, ada, board, {"name": "Revamp"}, {"name": "Other"})
    assert stale["status"] == "conflict" and stale["fields"] == ["name"], stale

    archived = _update(people, ada, board, {"archived_at": None}, {"archived_at": "2000-01-01T00:00:00Z"})
    assert archived["status"] == "applied", archived
    [(stamp, name, position)] = _as(
        people, "ada", "SELECT archived_at, name, position FROM board WHERE id = %s", board
    )
    assert stamp.year >= 2026 and (name, position) == ("Kanban", "W")  # the server's time, not the client's
    pulled = next(c["data"] for c in _pull(people.api)["changes"] if c["entity_id"] == board)
    back = _update(people, ada, board, {"archived_at": pulled["archived_at"]}, {"archived_at": None})
    assert back["status"] == "applied", back
    assert _as(people, "ada", "SELECT archived_at FROM board WHERE id = %s", board) == [(None,)]

    # Bob neither sees nor changes Ada's board.
    bob = people.as_("bob")
    foreign = _update(people, bob, board, {"name": "Kanban"}, {"name": "Mine"})
    assert foreign["status"] == "rejected" and foreign["problem"]["status"] == 404
    assert [c for c in _pull(people.api)["changes"] if c["entity_type"] == "board"] == []


@pytest.mark.db
def test_an_archived_board_is_read_only(people: People) -> None:
    ada = people.as_("ada")
    board, _ = _create(people, ada)
    card = _card(people, board)
    rename = _m("item", card, "update", base={"title": "Plan"}, data={"title": "Design"})
    assert (
        _update(people, ada, board, {"archived_at": None}, {"archived_at": "2026-10-29T10:00:00Z"})["status"]
        == "applied"
    )
    refused = _push(people.api, ada, rename)[0]
    assert refused["status"] == "rejected" and refused["problem"]["status"] == 409
    assert refused["problem"]["detail"] == "This board is archived"
    # Renaming the board itself stays possible; unarchived, its cards can be changed again.
    assert _update(people, ada, board, {"name": "Revamp"}, {"name": "Old revamp"})["status"] == "applied"
    pulled = next(c["data"] for c in _pull(people.api)["changes"] if c["entity_id"] == board)
    assert (
        _update(people, ada, board, {"archived_at": pulled["archived_at"]}, {"archived_at": None})["status"]
        == "applied"
    )
    assert _push(people.api, ada, {**rename, "mutation_id": str(uuid.uuid7())})[0]["status"] == "applied"


@pytest.mark.db
def test_a_board_is_shared_like_a_calendar(people: People) -> None:
    ada = people.as_("ada")
    board, _ = _create(people, ada)
    shared = people.share(ada, "bob@example.org", "edit", container_kind="board", container_id=board)
    assert shared.status_code == 201, shared.text
    assert shared.json()["container_name"] == "Revamp"

    bob = people.as_("bob")
    [row] = [c["data"] for c in _pull(people.api)["changes"] if c["entity_type"] == "board"]
    assert row["name"] == "Revamp"
    notes = people.api.get("/api/v1/notifications").json()["data"]
    [received] = [n for n in notes if n["kind"] == "share_received"]
    assert received["payload"]["container_kind"] == "board"
    assert received["payload"]["container_name"] == "Revamp"
    # An edit share writes the board's content, never the board itself.
    for mutation in (
        _m("board", board, "update", base={"name": "Revamp"}, data={"name": "Bob's"}),
        _m("board", board, "delete"),
    ):
        refused = _push(people.api, bob, mutation)[0]
        assert refused["status"] == "rejected" and refused["problem"]["status"] == 403, refused


@pytest.mark.db
def test_delete_takes_the_content_and_the_trash_brings_it_back(people: People) -> None:
    ada = people.as_("ada")
    board, _ = _create(people, ada)
    card = _card(people, board)
    assert (
        people.share(ada, "bob@example.org", "edit", container_kind="board", container_id=board).status_code
        == 201
    )
    deleted = _push(people.api, ada, _m("board", board, "delete", base_version=1))[0]
    assert deleted["status"] == "applied", deleted
    [(board_batch,)] = _as(people, "ada", "SELECT delete_batch_id FROM board WHERE id = %s", board)
    assert _as(people, "ada", "SELECT delete_batch_id FROM item WHERE id = %s", card) == [(board_batch,)]
    assert _push(people.api, ada, _m("board", board, "delete"))[0]["status"] == "applied"  # harmless again

    [entry] = people.api.get("/api/v1/trash", params={"module": "board"}).json()["data"]
    assert (entry["type"], entry["title"], entry["contents"]) == ("board", "Revamp", {"card": 1})

    bob = people.as_("bob")
    refused = people.api.post(
        "/api/v1/trash/restore", json={"entries": [{"type": "board", "id": board}]}, headers=bob
    ).json()
    assert refused["restored"] == 0 and refused["failed"][0]["code"] in ("forbidden", "not_found")

    ada = people.as_("ada")
    restored = people.api.post(
        "/api/v1/trash/restore", json={"entries": [{"type": "board", "id": board}]}, headers=ada
    ).json()
    assert (restored["restored"], restored["rows"]) == (1, 2), restored
    assert _as(people, "ada", "SELECT deleted_at FROM item WHERE id = %s", card) == [(None,)]
    # Restore through sync (Undo) is harmless on a live board.
    assert _push(people.api, ada, _m("board", board, "restore"))[0]["status"] == "applied"
