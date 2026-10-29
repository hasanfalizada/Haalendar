"""Kanban cards and board labels (FR-KAN-03, D-92): a card is created in a live column of its board with a title, moved to
another column by an update, given a due date with an optional time, a checklist, attachments and labels of its board;
the board's owner and edit shares write cards and labels, a view share and an archived board do not; cards go to the
trash alone, with their column or with their board, and come back with them. Marker `db`.

+++===+++ 2026-10-29 — Hasan Alizada — HAAL-112.
"""

from __future__ import annotations

import uuid
from typing import Any

import pytest
from fastapi.testclient import TestClient

from .test_boards import _create as _board
from .test_columns import _column
from .test_duplicate import _upload
from .test_reminders import _as
from .test_sharing import People
from .test_sync import _m, _pull, _push


@pytest.fixture
def people(api: TestClient, clean_db: str) -> People:
    return People(api, clean_db)


def _card(
    people: People, headers: dict[str, str], board: str, column: str, **data: Any
) -> tuple[str, dict[str, Any]]:
    card = str(uuid.uuid7())
    body = {
        "kind": "card",
        "container_kind": "board",
        "container_id": board,
        "column_id": column,
        "title": "Plan",
        "position": "U",
        **data,
    }
    return card, _push(people.api, headers, _m("item", card, "create", data=body))[0]


def _edit(
    people: People, headers: dict[str, str], card: str, base: dict[str, Any], data: dict[str, Any]
) -> Any:
    return _push(people.api, headers, _m("item", card, "update", base=base, data=data))[0]


def _pulled(people: People, entity: str) -> dict[str, dict[str, Any]]:
    return {c["entity_id"]: c["data"] for c in _pull(people.api)["changes"] if c["entity_type"] == entity}


def _board_with_columns(people: People, headers: dict[str, str]) -> tuple[str, str, str]:
    board, _ = _board(people, headers)
    todo, _ = _column(people, headers, board)
    done, _ = _column(people, headers, board, name="Done", position="k")
    return board, todo, done


def _restore(people: People, headers: dict[str, str], kind: str, row: str) -> dict[str, Any]:
    response = people.api.post(
        "/api/v1/trash/restore", json={"entries": [{"type": kind, "id": row}]}, headers=headers
    )
    assert response.status_code == 200, response.text
    body: dict[str, Any] = response.json()
    return body


@pytest.mark.db
def test_a_card_is_created_in_a_column_edited_and_moved(people: People) -> None:
    ada = people.as_("ada")
    board, todo, done = _board_with_columns(people, ada)
    card, created = _card(people, ada, board, todo, title="  Plan  ", body="- one", due_date="2026-11-10")
    assert created["status"] == "applied", created
    row = _pulled(people, "item")[card]
    assert (row["kind"], row["title"], row["container_id"], row["column_id"], row["position"]) == (
        "card",
        "Plan",
        board,
        todo,
        "U",
    )
    assert (row["due_date"], row["due_time"], row["color"]) == ("2026-11-10", None, "blue")
    assert "board_id" not in row

    other, _ = _board(people, ada, name="Other")
    elsewhere, _ = _column(people, ada, other)
    archived, _ = _column(people, ada, board, name="Old", position="z", archived_at="2026-10-29T10:00:00Z")
    for data, status in (
        ({"title": " "}, 422),
        ({"column_id": None}, 422),
        ({"column_id": elsewhere}, 422),
        ({"column_id": archived}, 409),
        ({"due_time": "09:00"}, 422),
        ({"due_date": "10.11.2026"}, 422),
        ({"pinned": True}, 422),
        ({"container_kind": "calendar", "container_id": people.calendar}, 422),
    ):
        refused = _card(people, ada, board, todo, **data)[1]
        assert refused["status"] == "rejected" and refused["problem"]["status"] == status, (data, refused)

    timed = _edit(
        people,
        ada,
        card,
        {"title": "Plan", "due_time": None, "priority": "medium"},
        {"title": "Plan the release", "due_time": "09:30", "priority": "high"},
    )
    assert timed["status"] == "applied", timed
    assert (_pulled(people, "item")[card]["due_time"], _pulled(people, "item")[card]["priority"]) == (
        "09:30",
        "high",
    )
    # Clearing the date takes the time along.
    cleared = _edit(people, ada, card, {"due_date": "2026-11-10"}, {"due_date": None})
    assert cleared["status"] == "applied", cleared
    assert _as(people, "ada", "SELECT due_date, due_time FROM card WHERE id = %s", card) == [(None, None)]

    moved = _edit(
        people, ada, card, {"column_id": todo, "position": "U"}, {"column_id": done, "position": "V"}
    )
    assert moved["status"] == "applied", moved
    assert _pulled(people, "item")[card]["column_id"] == done
    stale = _edit(people, ada, card, {"position": "U"}, {"position": "W"})
    assert stale["status"] == "conflict" and stale["fields"] == ["position"], stale
    into_archive = _edit(people, ada, card, {"column_id": done}, {"column_id": archived})
    assert into_archive["status"] == "rejected" and into_archive["problem"]["status"] == 409
    away = _push(
        people.api,
        ada,
        _m(
            "item",
            card,
            "move",
            base={"container_kind": "board", "container_id": board},
            data={"container_kind": "board", "container_id": other},
        ),
    )[0]
    assert away["status"] == "rejected" and away["problem"]["status"] == 422

    # A checklist and an attachment on the card.
    item = str(uuid.uuid7())
    checklist = _push(
        people.api,
        ada,
        _m("checklist_item", item, "create", data={"item_id": card, "text": "Draft", "position": "U"}),
    )[0]
    assert checklist["status"] == "applied", checklist
    _upload(people, ada, card, "plan.png")
    [(kind, container)] = _as(
        people, "ada", "SELECT container_kind, container_id::text FROM attachment WHERE item_id = %s", card
    )
    assert (kind, container) == ("board", board)


@pytest.mark.db
def test_edit_shares_write_cards_view_shares_and_archived_boards_do_not(people: People) -> None:
    ada = people.as_("ada")
    board, todo, _ = _board_with_columns(people, ada)
    card, _ = _card(people, ada, board, todo)
    assert (
        people.share(ada, "bob@example.org", "edit", container_kind="board", container_id=board).status_code
        == 201
    )
    assert (
        people.share(ada, "cid@example.org", "view", container_kind="board", container_id=board).status_code
        == 201
    )

    bob = people.as_("bob")
    assert card in _pulled(people, "item")
    assert _card(people, bob, board, todo, title="Bob's")[1]["status"] == "applied"
    assert _edit(people, bob, card, {"title": "Plan"}, {"title": "Plan B"})["status"] == "applied"

    cid = people.as_("cid")
    for refused in (
        _card(people, cid, board, todo)[1],
        _edit(people, cid, card, {"title": "Plan B"}, {"title": "C"}),
    ):
        assert refused["status"] == "rejected" and refused["problem"]["status"] == 403, refused

    ada = people.as_("ada")
    archive = _push(
        people.api,
        ada,
        _m(
            "board", board, "update", base={"archived_at": None}, data={"archived_at": "2026-10-29T10:00:00Z"}
        ),
    )[0]
    assert archive["status"] == "applied"
    refused = _edit(people, ada, card, {"title": "Plan B"}, {"title": "Later"})
    assert refused["status"] == "rejected" and refused["problem"]["detail"] == "This board is archived"


@pytest.mark.db
def test_board_labels_on_cards(people: People) -> None:
    ada = people.as_("ada")
    board, todo, _ = _board_with_columns(people, ada)
    card, _ = _card(people, ada, board, todo)
    urgent = str(uuid.uuid7())
    made = _push(
        people.api,
        ada,
        _m("label", urgent, "create", data={"board_id": board, "name": " Urgent ", "color": "red"}),
    )[0]
    assert made["status"] == "applied", made
    for data, status in (
        ({"name": "urgent"}, 409),
        ({"name": "x" * 41}, 422),
        ({"name": "Blue", "color": "pink"}, 422),
    ):
        refused = _push(
            people.api,
            ada,
            _m("label", str(uuid.uuid7()), "create", data={"board_id": board, "color": "blue", **data}),
        )[0]
        assert refused["status"] == "rejected" and refused["problem"]["status"] == status, (data, refused)
    renamed = _push(
        people.api,
        ada,
        _m(
            "label",
            urgent,
            "update",
            base={"name": "Urgent", "color": "red"},
            data={"name": "Now", "color": "orange"},
        ),
    )[0]
    assert renamed["status"] == "applied", renamed
    assert (_pulled(people, "label")[urgent]["name"], _pulled(people, "label")[urgent]["color"]) == (
        "Now",
        "orange",
    )

    on = str(uuid.uuid7())
    added = _push(
        people.api, ada, _m("item_label", on, "create", data={"item_id": card, "label_id": urgent})
    )[0]
    assert added["status"] == "applied", added
    twice = _push(
        people.api,
        ada,
        _m("item_label", str(uuid.uuid7()), "create", data={"item_id": card, "label_id": urgent}),
    )[0]
    assert twice["status"] == "rejected" and twice["problem"]["status"] == 409
    other, _ = _board(people, ada, name="Other")
    stranger = str(uuid.uuid7())
    _push(people.api, ada, _m("label", stranger, "create", data={"board_id": other, "name": "Elsewhere"}))
    wrong = _push(
        people.api,
        ada,
        _m("item_label", str(uuid.uuid7()), "create", data={"item_id": card, "label_id": stranger}),
    )[0]
    assert wrong["status"] == "rejected" and wrong["problem"]["status"] == 422
    assert _pulled(people, "item_label")[on]["label_id"] == urgent

    # Removed and put back; deleting the label takes it off the card in the same batch, restoring brings it back.
    assert _push(people.api, ada, _m("item_label", on, "delete"))[0]["status"] == "applied"
    assert _push(people.api, ada, _m("item_label", on, "restore"))[0]["status"] == "applied"
    assert _push(people.api, ada, _m("label", urgent, "delete"))[0]["status"] == "applied"
    [(gone,)] = _as(people, "ada", "SELECT deleted_at IS NOT NULL FROM item_label WHERE id = %s", on)
    assert gone is True
    assert _push(people.api, ada, _m("label", urgent, "restore"))[0]["status"] == "applied"
    assert _as(people, "ada", "SELECT deleted_at FROM item_label WHERE id = %s", on) == [(None,)]

    # A view share neither makes labels nor puts them on cards.
    assert (
        people.share(ada, "cid@example.org", "view", container_kind="board", container_id=board).status_code
        == 201
    )
    cid = people.as_("cid")
    assert urgent in _pulled(people, "label") and on in _pulled(people, "item_label")
    refused = _push(
        people.api, cid, _m("label", str(uuid.uuid7()), "create", data={"board_id": board, "name": "Cid"})
    )[0]
    assert refused["status"] == "rejected" and refused["problem"]["status"] == 403


@pytest.mark.db
def test_cards_go_to_the_trash_alone_with_their_column_or_with_their_board(people: People) -> None:
    ada = people.as_("ada")
    board, todo, done = _board_with_columns(people, ada)
    first, _ = _card(people, ada, board, todo, title="First")
    second, _ = _card(people, ada, board, done, title="Second")
    label = str(uuid.uuid7())
    _push(people.api, ada, _m("label", label, "create", data={"board_id": board, "name": "Urgent"}))
    _push(
        people.api,
        ada,
        _m("item_label", str(uuid.uuid7()), "create", data={"item_id": second, "label_id": label}),
    )

    assert _push(people.api, ada, _m("item", first, "delete"))[0]["status"] == "applied"
    [entry] = people.api.get("/api/v1/trash", params={"module": "card"}).json()["data"]
    assert (entry["type"], entry["title"]) == ("card", "First")
    assert _restore(people, ada, "card", first)["restored"] == 1

    # With its column: inside the column's entry, not on its own; refused while the column is in the trash.
    assert _push(people.api, ada, _m("board_column", done, "delete"))[0]["status"] == "applied"
    entries = {e["type"]: e for e in people.api.get("/api/v1/trash").json()["data"]}
    assert entries["column"]["contents"] == {"card": 1, "item_label": 1} and "card" not in entries
    refused = _restore(people, ada, "card", second)
    assert (
        refused["failed"][0]["code"] == "parent_in_trash"
        and refused["failed"][0]["parent"]["type"] == "column"
    )
    assert _restore(people, ada, "column", done)["rows"] == 3
    assert _as(people, "ada", "SELECT deleted_at FROM item WHERE id = %s", second) == [(None,)]

    # With its board: everything in one batch.
    assert _push(people.api, ada, _m("board", board, "delete"))[0]["status"] == "applied"
    [board_entry] = people.api.get("/api/v1/trash", params={"module": "board"}).json()["data"]
    assert board_entry["contents"] == {"column": 2, "card": 2, "label": 1, "item_label": 1}
    assert _restore(people, ada, "board", board)["rows"] == 7
