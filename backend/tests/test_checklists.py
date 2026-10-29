"""Checklist items of notes (FR-TODO-02, D-88): created on a live note through sync (text, position, at most 200), merged
field by field (checking stamps the server's time), soft-deleted and restored one by one; the note's delete takes them
into its batch and its restore — through sync or the trash — brings back only those; other users see and change
nothing. Marker `db`.

+++===+++ 2026-10-29 — Hasan Alizada — HAAL-101.
"""

from __future__ import annotations

import uuid
from typing import Any

import pytest
from fastapi.testclient import TestClient

from .test_notes import _create
from .test_reminders import _as
from .test_sharing import People
from .test_sync import _m, _pull, _push


@pytest.fixture
def people(api: TestClient, clean_db: str) -> People:
    return People(api, clean_db)


def _add(people: People, headers: dict[str, str], note: str, text: str, position: str, **extra: Any) -> str:
    row = str(uuid.uuid7())
    data = {"item_id": note, "text": text, "position": position, **extra}
    result = _push(people.api, headers, _m("checklist_item", row, "create", data=data))[0]
    assert result["status"] == "applied", result
    return row


def _pulled(people: People) -> dict[str, dict[str, Any]]:
    return {
        c["entity_id"]: c["data"]
        for c in _pull(people.api)["changes"]
        if c["entity_type"] == "checklist_item"
    }


def _alive(people: People, note: str) -> list[tuple[Any, ...]]:
    return _as(
        people,
        "ada",
        'SELECT text, deleted_at IS NULL FROM checklist_item WHERE item_id = %s ORDER BY position COLLATE "C"',
        note,
    )


@pytest.mark.db
def test_add_check_edit_and_order(people: People) -> None:
    ada = people.as_("ada")
    note, _ = _create(people, ada, is_checklist=True)
    milk = _add(people, ada, note, "  Milk ", "U")
    bread = _add(people, ada, note, "Bread", "k", checked=True)
    rows = _pulled(people)
    assert (rows[milk]["text"], rows[milk]["checked"], rows[milk]["checked_at"]) == ("Milk", False, None)
    assert (rows[milk]["item_id"], rows[milk]["container_kind"], rows[milk]["container_id"]) == (
        note,
        "note",
        note,
    )
    assert rows[bread]["checked"] is True and rows[bread]["checked_at"] > "2026"
    assert (
        next(c["data"] for c in _pull(people.api)["changes"] if c["entity_id"] == note)["is_checklist"]
        is True
    )

    check = _m("checklist_item", milk, "update", base={"checked": False}, data={"checked": True})
    uncheck = _m("checklist_item", bread, "update", base={"checked": True}, data={"checked": False})
    rename = _m("checklist_item", milk, "update", base={"text": "Milk"}, data={"text": "Oat milk"})
    move = _m("checklist_item", bread, "update", base={"position": "k"}, data={"position": "M"})
    assert [r["status"] for r in _push(people.api, ada, check, uncheck, rename, move)] == ["applied"] * 4
    rows = _pulled(people)
    assert rows[milk]["checked"] is True and rows[milk]["checked_at"] and rows[milk]["text"] == "Oat milk"
    assert rows[bread]["checked"] is False and rows[bread]["checked_at"] is None
    assert _alive(people, note) == [("Bread", True), ("Oat milk", True)]

    stale = _m("checklist_item", milk, "update", base={"text": "Milk"}, data={"text": "Soy milk"})
    [result] = _push(people.api, ada, stale)
    assert result["status"] == "conflict" and result["fields"] == ["text"]
    assert result["current"]["text"] == "Oat milk"

    off = _m("item", note, "update", base={"is_checklist": True}, data={"is_checklist": False})
    assert _push(people.api, ada, off)[0]["status"] == "applied"


@pytest.mark.db
def test_rules(people: People) -> None:
    ada = people.as_("ada")
    note, _ = _create(people, ada)
    for data, field in (
        ({"text": "  ", "position": "U"}, "text"),
        ({"text": "x" * 501, "position": "U"}, "text"),
        ({"text": "Milk", "position": "a b"}, "position"),
        ({"text": "Milk"}, "position"),
    ):
        mutation = _m("checklist_item", str(uuid.uuid7()), "create", data={"item_id": note, **data})
        [result] = _push(people.api, ada, mutation)
        assert result["status"] == "rejected", (data, result)
        assert result["problem"]["errors"][0]["field"] == field
    event = str(uuid.uuid7())
    body = {
        "kind": "event",
        "container_kind": "calendar",
        "container_id": people.calendar,
        "title": "Dentist",
        "start_date": "2026-11-12",
    }
    assert _push(people.api, ada, _m("item", event, "create", data=body))[0]["status"] == "applied"
    on_event = _m(
        "checklist_item", str(uuid.uuid7()), "create", data={"item_id": event, "text": "x", "position": "U"}
    )
    assert _push(people.api, ada, on_event)[0]["problem"]["status"] == 422

    # At most 200 live items on one note.
    many = [
        _m(
            "checklist_item",
            str(uuid.uuid7()),
            "create",
            data={"item_id": note, "text": f"Item {i}", "position": "U"},
        )
        for i in range(201)
    ]
    results = _push(people.api, ada, *many)
    assert [r["status"] for r in results[:200]] == ["applied"] * 200
    assert results[200]["status"] == "rejected" and results[200]["problem"]["status"] == 409


@pytest.mark.db
def test_only_the_note_owner_reads_and_writes_its_items(people: People) -> None:
    ada = people.as_("ada")
    note, _ = _create(people, ada)
    milk = _add(people, ada, note, "Milk", "U")
    bob = people.as_("bob")
    assert milk not in _pulled(people)
    assert _as(people, "bob", "SELECT count(*) FROM checklist_item") == [(0,)]
    for mutation in (
        _m(
            "checklist_item",
            str(uuid.uuid7()),
            "create",
            data={"item_id": note, "text": "Beer", "position": "A"},
        ),
        _m("checklist_item", milk, "update", base={"checked": False}, data={"checked": True}),
        _m("checklist_item", milk, "delete"),
    ):
        result = _push(people.api, bob, mutation)[0]
        assert result["status"] == "rejected" and result["problem"]["status"] == 404, mutation


@pytest.mark.db
def test_deleting_one_item_and_the_whole_note(people: People) -> None:
    ada = people.as_("ada")
    note, _ = _create(people, ada, is_checklist=True)
    milk = _add(people, ada, note, "Milk", "U")
    bread = _add(people, ada, note, "Bread", "k")
    assert _push(people.api, ada, _m("checklist_item", bread, "delete"))[0]["status"] == "applied"
    assert _pulled(people)[bread]["deleted_at"] is not None
    assert _push(people.api, ada, _m("checklist_item", bread, "restore"))[0]["status"] == "applied"
    assert _push(people.api, ada, _m("checklist_item", bread, "delete"))[0]["status"] == "applied"

    # The note takes its live items along; its restore brings back only those.
    assert _push(people.api, ada, _m("item", note, "delete"))[0]["status"] == "applied"
    assert _alive(people, note) == [("Milk", False), ("Bread", False)]
    [entry] = people.api.get("/api/v1/trash", params={"module": "note"}).json()["data"]
    assert entry["contents"] == {"checklist_item": 1}
    on_deleted = _m(
        "checklist_item", str(uuid.uuid7()), "create", data={"item_id": note, "text": "x", "position": "A"}
    )
    assert _push(people.api, ada, on_deleted)[0]["problem"]["status"] == 409
    restored = people.api.post(
        "/api/v1/trash/restore", json={"entries": [{"type": "note", "id": note}]}, headers=ada
    ).json()
    assert restored["restored"] == 1
    assert _alive(people, note) == [("Milk", True), ("Bread", False)]
    assert _pulled(people)[milk]["deleted_at"] is None
