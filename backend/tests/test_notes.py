"""Notes (FR-TODO-01, FR-TODO-03, D-87): an item of kind `note` that is its own container, written through sync like
events — create (owner only, position required), field-level update of the item and note fields (archive as a flag,
the server's own time), no move, soft delete with the attachments and restore (sync and trash); other users neither
see nor change it. Marker `db`.

+++===+++ 2026-10-29 — Hasan Alizada — HAAL-100.
"""

from __future__ import annotations

import uuid
from typing import Any

import pytest
from fastapi.testclient import TestClient

from .test_duplicate import _upload
from .test_reminders import _as
from .test_sharing import People
from .test_sync import _m, _pull, _push


@pytest.fixture
def people(api: TestClient, clean_db: str) -> People:
    return People(api, clean_db)


def _create(people: People, headers: dict[str, str], **data: Any) -> tuple[str, dict[str, Any]]:
    note = str(uuid.uuid7())
    body = {"kind": "note", "title": "Shopping", "body": "- milk", "position": "U", **data}
    return note, _push(people.api, headers, _m("item", note, "create", data=body))[0]


def _row(people: People, note: str) -> dict[str, Any]:
    [row] = [
        c["data"]
        for c in _pull(people.api)["changes"]
        if c["entity_type"] == "item" and c["entity_id"] == note
    ]
    assert isinstance(row, dict)
    return row


@pytest.mark.db
def test_create_update_archive_and_pin(people: People) -> None:
    ada = people.as_("ada")
    note, result = _create(people, ada, color="yellow", priority="high", pinned=True)
    assert result["status"] == "applied", result
    row = _row(people, note)
    assert (row["kind"], row["container_kind"], row["container_id"]) == ("note", "note", note)
    assert (row["title"], row["body"], row["color"], row["priority"]) == (
        "Shopping",
        "- milk",
        "yellow",
        "high",
    )
    assert (row["pinned"], row["archived_at"], row["position"], row["is_checklist"]) == (
        True,
        None,
        "U",
        False,
    )

    # Archive: any time archives, the server keeps its own; the other fields merge field by field.
    update = _m(
        "item",
        note,
        "update",
        base={"archived_at": None, "pinned": True, "title": "Shopping"},
        data={"archived_at": "2000-01-01T00:00:00Z", "pinned": False, "title": "  Groceries "},
    )
    assert _push(people.api, ada, update)[0]["status"] == "applied"
    row = _row(people, note)
    assert row["archived_at"] > "2026" and row["pinned"] is False and row["title"] == "Groceries"
    # An archived note stays editable (archive ≠ delete).
    edit = _m("item", note, "update", base={"body": "- milk"}, data={"body": "- bread"})
    assert _push(people.api, ada, edit)[0]["status"] == "applied"

    # A field changed elsewhere since its base conflicts and keeps the server value.
    stale = _m("item", note, "update", base={"position": "A"}, data={"position": "B"})
    [result] = _push(people.api, ada, stale)
    assert result["status"] == "conflict" and result["fields"] == ["position"]
    assert result["current"]["position"] == "U"
    back = _m("item", note, "update", base={"archived_at": row["archived_at"]}, data={"archived_at": None})
    assert _push(people.api, ada, back)[0]["status"] == "applied"
    assert _row(people, note)["archived_at"] is None


@pytest.mark.db
def test_rules_of_a_note(people: People) -> None:
    ada = people.as_("ada")
    for data, field in (
        ({"position": "a b"}, "position"),
        ({"position": None}, "position"),
        ({"container_id": people.calendar}, None),
        ({"container_kind": "calendar"}, None),
    ):
        _, result = _create(people, ada, **data)
        assert result["status"] == "rejected", (data, result)
        if field:
            assert result["problem"]["errors"][0]["field"] == field
    note, _ = _create(people, ada)
    for mutation in (
        _m("item", note, "update", base={}, data={"start_date": "2026-11-01"}),
        _m("item", note, "update", base={"position": "U"}, data={"position": "x!"}),
        _m(
            "item",
            note,
            "move",
            base={},
            data={"container_kind": "calendar", "container_id": people.calendar},
        ),
    ):
        assert _push(people.api, ada, mutation)[0]["status"] == "rejected", mutation
    event = str(uuid.uuid7())
    with_pin = {
        "kind": "event",
        "container_kind": "calendar",
        "container_id": people.calendar,
        "title": "Dentist",
        "start_date": "2026-11-12",
        "pinned": True,
    }
    assert _push(people.api, ada, _m("item", event, "create", data=with_pin))[0]["status"] == "rejected"
    no_calendar = {"kind": "event", "title": "Dentist", "start_date": "2026-11-12"}
    assert _push(people.api, ada, _m("item", event, "create", data=no_calendar))[0]["status"] == "rejected"


@pytest.mark.db
def test_only_the_owner_sees_and_changes_a_note(people: People) -> None:
    ada = people.as_("ada")
    note, _ = _create(people, ada)
    bob = people.as_("bob")
    assert note not in [c["entity_id"] for c in _pull(people.api)["changes"]]
    assert _as(people, "bob", "SELECT count(*) FROM item WHERE id = %s", note) == [(0,)]
    assert _as(people, "bob", "SELECT count(*) FROM note WHERE id = %s", note) == [(0,)]
    for mutation in (
        _m("item", note, "update", base={"title": "Shopping"}, data={"title": "Mine"}),
        _m("item", note, "delete"),
    ):
        result = _push(people.api, bob, mutation)[0]
        assert result["status"] == "rejected" and result["problem"]["status"] == 404
    # Bob cannot slip a note into Ada's: a note's id is its container.
    _, result = _create(people, bob, container_id=note)
    assert result["status"] == "rejected"
    assert _as(people, "ada", "SELECT title FROM item WHERE id = %s", note) == [("Shopping",)]


@pytest.mark.db
def test_delete_takes_the_attachments_and_restore_brings_them_back(people: People) -> None:
    ada = people.as_("ada")
    note, _ = _create(people, ada)
    _upload(people, ada, note, "list.png")
    assert _push(people.api, ada, _m("item", note, "delete"))[0]["status"] == "applied"
    assert (
        _push(people.api, ada, _m("item", note, "delete"))[0]["status"] == "applied"
    )  # repeating is harmless
    gone = "SELECT deleted_at IS NOT NULL FROM attachment WHERE item_id = %s"
    assert _as(people, "ada", gone, note) == [(True,)]
    assert _push(people.api, ada, _m("item", note, "restore"))[0]["status"] == "applied"
    assert _as(people, "ada", gone, note) == [(False,)]

    assert _push(people.api, ada, _m("item", note, "delete"))[0]["status"] == "applied"
    [entry] = people.api.get("/api/v1/trash", params={"module": "note"}).json()["data"]
    assert (entry["type"], entry["title"], entry["contents"]) == ("note", "Shopping", {"attachment": 1})
    restored = people.api.post(
        "/api/v1/trash/restore", json={"entries": [{"type": "note", "id": note}]}, headers=ada
    ).json()
    assert restored["restored"] == 1 and restored["failed"] == []
    assert _row(people, note)["deleted_at"] is None
    assert _as(people, "ada", gone, note) == [(False,)]
