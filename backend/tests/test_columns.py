"""Columns of Kanban boards (FR-KAN-02, D-91): created, renamed, reordered, given a WIP limit and archived through sync by
the board's owner or an edit share (a view share and strangers are refused, an archived board is read-only); a grantee
receives the columns with the board; a column goes to the trash on its own or with its board, and the trash restores it
(not while its board is in the trash). Marker `db`.

+++===+++ 2026-10-29 — Hasan Alizada — HAAL-111.
"""

from __future__ import annotations

import uuid
from typing import Any

import pytest
from fastapi.testclient import TestClient

from .test_boards import _create as _board
from .test_reminders import _as
from .test_sharing import People
from .test_sync import _m, _pull, _push


@pytest.fixture
def people(api: TestClient, clean_db: str) -> People:
    return People(api, clean_db)


def _column(people: People, headers: dict[str, str], board: str, **data: Any) -> tuple[str, dict[str, Any]]:
    column = str(uuid.uuid7())
    body = {"board_id": board, "name": "To do", "position": "U", **data}
    return column, _push(people.api, headers, _m("board_column", column, "create", data=body))[0]


def _update(
    people: People, headers: dict[str, str], column: str, base: dict[str, Any], data: dict[str, Any]
) -> Any:
    return _push(people.api, headers, _m("board_column", column, "update", base=base, data=data))[0]


def _columns(people: People) -> dict[str, dict[str, Any]]:
    return {
        c["entity_id"]: c["data"] for c in _pull(people.api)["changes"] if c["entity_type"] == "board_column"
    }


@pytest.mark.db
def test_the_owner_creates_renames_reorders_limits_and_archives_columns(people: People) -> None:
    ada = people.as_("ada")
    board, _ = _board(people, ada)
    todo, created = _column(people, ada, board, name="  To do  ")
    assert created["status"] == "applied", created
    done, _ = _column(people, ada, board, name="Done", position="k", wip_limit=5)
    pulled = _columns(people)
    assert (pulled[todo]["name"], pulled[todo]["board_id"], pulled[todo]["wip_limit"]) == (
        "To do",
        board,
        None,
    )
    assert pulled[done]["wip_limit"] == 5 and pulled[done]["archived_at"] is None

    for data in (
        {"name": " "},
        {"name": "x" * 61},
        {"position": "a b"},
        {"wip_limit": 0},
        {"wip_limit": 1000},
        {"wip_limit": "many"},
        {"board_id": str(uuid.uuid7())},
    ):
        refused = _column(people, ada, board, **data)[1]
        assert refused["status"] == "rejected" and refused["problem"]["status"] in (404, 422), (data, refused)
    no_position = _push(
        people.api,
        ada,
        _m("board_column", str(uuid.uuid7()), "create", data={"board_id": board, "name": "X"}),
    )[0]
    assert no_position["status"] == "rejected" and no_position["problem"]["status"] == 422

    moved = _update(
        people,
        ada,
        todo,
        {"name": "To do", "position": "U", "wip_limit": None},
        {"name": "Backlog", "position": "z", "wip_limit": 3},
    )
    assert moved["status"] == "applied", moved
    stale = _update(people, ada, todo, {"name": "To do"}, {"name": "Ideas"})
    assert stale["status"] == "conflict" and stale["fields"] == ["name"], stale
    archived = _update(people, ada, done, {"archived_at": None}, {"archived_at": "2000-01-01T00:00:00Z"})
    assert archived["status"] == "applied", archived
    [(stamp,)] = _as(people, "ada", "SELECT archived_at FROM board_column WHERE id = %s", done)
    assert stamp.year >= 2026  # the server's time
    pulled = _columns(people)
    assert (pulled[todo]["name"], pulled[todo]["position"], pulled[todo]["wip_limit"]) == ("Backlog", "z", 3)
    back = _update(people, ada, done, {"archived_at": pulled[done]["archived_at"]}, {"archived_at": None})
    assert back["status"] == "applied", back
    unlimited = _update(people, ada, todo, {"wip_limit": 3}, {"wip_limit": None})
    assert unlimited["status"] == "applied", unlimited


@pytest.mark.db
def test_edit_shares_write_columns_view_shares_and_archived_boards_do_not(people: People) -> None:
    ada = people.as_("ada")
    board, _ = _board(people, ada)
    todo, _ = _column(people, ada, board)
    assert (
        people.share(ada, "bob@example.org", "edit", container_kind="board", container_id=board).status_code
        == 201
    )
    assert (
        people.share(ada, "cid@example.org", "view", container_kind="board", container_id=board).status_code
        == 201
    )

    bob = people.as_("bob")
    assert set(_columns(people)) == {todo}  # the grantee receives the board's columns
    doing, by_bob = _column(people, bob, board, name="Doing", position="k")
    assert by_bob["status"] == "applied", by_bob
    assert _update(people, bob, todo, {"name": "To do"}, {"name": "Next"})["status"] == "applied"

    cid = people.as_("cid")
    for refused in (
        _column(people, cid, board, name="Cid's")[1],
        _update(people, cid, todo, {"name": "Next"}, {"name": "Mine"}),
        _push(people.api, cid, _m("board_column", doing, "delete"))[0],
    ):
        assert refused["status"] == "rejected" and refused["problem"]["status"] == 403, refused

    stranger = _board(people, cid)[0]
    assert _column(people, people.as_("ada"), stranger)[1]["problem"]["status"] == 404

    ada = people.as_("ada")
    archive = _push(
        people.api,
        ada,
        _m(
            "board", board, "update", base={"archived_at": None}, data={"archived_at": "2026-10-29T10:00:00Z"}
        ),
    )[0]
    assert archive["status"] == "applied"
    for refused in (
        _column(people, ada, board)[1],
        _update(people, ada, todo, {"name": "Next"}, {"name": "Later"}),
    ):
        assert refused["status"] == "rejected" and refused["problem"]["detail"] == "This board is archived", (
            refused
        )


def _restore(people: People, headers: dict[str, str], kind: str, row: str) -> dict[str, Any]:
    response = people.api.post(
        "/api/v1/trash/restore", json={"entries": [{"type": kind, "id": row}]}, headers=headers
    )
    assert response.status_code == 200, response.text
    body: dict[str, Any] = response.json()
    return body


@pytest.mark.db
def test_columns_go_to_the_trash_alone_or_with_their_board(people: People) -> None:
    ada = people.as_("ada")
    board, _ = _board(people, ada)
    todo, _ = _column(people, ada, board)
    done, _ = _column(people, ada, board, name="Done", position="k")

    assert (
        _push(people.api, ada, _m("board_column", todo, "delete", base_version=1))[0]["status"] == "applied"
    )
    [entry] = people.api.get("/api/v1/trash", params={"module": "column"}).json()["data"]
    assert (entry["type"], entry["title"]) == ("column", "To do")
    assert _restore(people, ada, "column", todo)["restored"] == 1
    assert _as(people, "ada", "SELECT deleted_at FROM board_column WHERE id = %s", todo) == [(None,)]

    # Deleted with its board: shown inside the board's entry, restored with it, not on its own before.
    assert _push(people.api, ada, _m("board_column", done, "delete"))[0]["status"] == "applied"
    assert _push(people.api, ada, _m("board", board, "delete"))[0]["status"] == "applied"
    entries = {e["type"]: e for e in people.api.get("/api/v1/trash").json()["data"]}
    assert entries["board"]["contents"] == {"column": 1}
    assert entries["column"]["title"] == "Done"  # deleted earlier, on its own
    refused = _restore(people, ada, "column", done)
    assert (
        refused["failed"][0]["code"] == "parent_in_trash"
        and refused["failed"][0]["parent"]["type"] == "board"
    )
    assert _restore(people, ada, "board", board)["rows"] == 2
    states = dict(
        _as(people, "ada", "SELECT name, deleted_at IS NULL FROM board_column WHERE board_id = %s", board)
    )
    assert states == {"To do": True, "Done": False}
    assert _restore(people, ada, "column", done)["restored"] == 1
