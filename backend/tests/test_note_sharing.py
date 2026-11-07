"""Shared notes (FR-ACC-10, D-30, D-87): the owner shares a note like a calendar or a board; the grantee receives it
with its checklist and a notification naming it; an edit share writes the content (title, text, colour, priority,
checklist), a view share nothing; pinned, order, archive, delete and restore stay the owner's. Marker `db`.

+++===+++ 2026-11-07 — Hasan Alizada — HAAL-145 (UAT finding F7).
"""

from __future__ import annotations

import uuid
from typing import Any

import pytest
from fastapi.testclient import TestClient

from .test_notes import _create
from .test_sharing import People
from .test_sync import _m, _pull, _push

pytestmark = pytest.mark.db


@pytest.fixture
def people(api: TestClient, clean_db: str) -> People:
    return People(api, clean_db)


def _rows(people: People, kind: str) -> dict[str, dict[str, Any]]:
    return {c["entity_id"]: c["data"] for c in _pull(people.api)["changes"] if c["entity_type"] == kind}


def _status(result: dict[str, Any]) -> tuple[str, int | None]:
    return result["status"], (result.get("problem") or {}).get("status")


def _shared_note(people: People, permission: str) -> tuple[str, str]:
    ada = people.as_("ada")
    note, created = _create(people, ada, title="Trip")
    assert created["status"] == "applied"
    item = str(uuid.uuid7())
    passport = _m(
        "checklist_item", item, "create", data={"item_id": note, "text": "Passport", "position": "U"}
    )
    assert _push(people.api, ada, passport)[0]["status"] == "applied"
    shared = people.share(ada, "bob@example.org", permission, container_kind="note", container_id=note)
    assert shared.status_code == 201, shared.text
    assert shared.json()["container_name"] == "Trip"
    return note, item


def test_a_shared_note_reaches_the_grantee_with_its_checklist_and_a_notification(people: People) -> None:
    note, item = _shared_note(people, "view")
    people.as_("bob")
    assert _rows(people, "item")[note]["title"] == "Trip"
    assert _rows(people, "checklist_item")[item]["text"] == "Passport"
    notes = people.api.get("/api/v1/notifications").json()["data"]
    [received] = [n for n in notes if n["kind"] == "share_received"]
    assert received["payload"]["container_kind"] == "note"
    assert received["payload"]["container_name"] == "Trip"
    [share] = people.api.get("/api/v1/shares", params={"direction": "received"}).json()["data"]
    assert (share["container_kind"], share["container_id"], share["owner_name"]) == ("note", note, "Ada")
    # Cid has no share and sees nothing.
    people.as_("cid")
    assert note not in _rows(people, "item")


def test_a_view_share_writes_nothing(people: People) -> None:
    note, _ = _shared_note(people, "view")
    bob = people.as_("bob")
    edit = _m("item", note, "update", base={"title": "Trip"}, data={"title": "Bob's trip"})
    assert _status(_push(people.api, bob, edit)[0]) == ("rejected", 403)


def test_an_edit_share_writes_the_content_but_not_the_owners_arrangement(people: People) -> None:
    note, _ = _shared_note(people, "edit")
    bob = people.as_("bob")
    content = [
        _m(
            "item",
            note,
            "update",
            base={"title": "Trip", "color": "brown"},
            data={"title": "Trip to Rome", "color": "blue"},
        ),
        _m(
            "checklist_item",
            str(uuid.uuid7()),
            "create",
            data={"item_id": note, "text": "Tickets", "position": "Z"},
        ),
    ]
    for mutation in content:
        assert _status(_push(people.api, bob, mutation)[0]) == ("applied", None)
    owners = [
        _m("item", note, "update", base={"pinned": False}, data={"pinned": True}),
        _m("item", note, "update", base={"position": "U"}, data={"position": "A"}),
        _m("item", note, "update", base={"archived_at": None}, data={"archived_at": "2026-11-07T00:00:00Z"}),
        _m("item", note, "delete"),
    ]
    for mutation in owners:
        assert _status(_push(people.api, bob, mutation)[0]) == ("rejected", 403), mutation
    ada = people.as_("ada")
    row = _rows(people, "item")[note]
    assert (row["title"], row["color"], row["pinned"], row["deleted_at"]) == (
        "Trip to Rome",
        "blue",
        False,
        None,
    )
    # The owner deletes it; the grantee cannot bring it back from the trash.
    assert _status(_push(people.api, ada, _m("item", note, "delete"))[0]) == ("applied", None)
    bob = people.as_("bob")
    assert _status(_push(people.api, bob, _m("item", note, "restore"))[0]) == ("rejected", 403)
    refused = people.api.post(
        "/api/v1/trash/restore", json={"entries": [{"type": "note", "id": note}]}, headers=bob
    ).json()
    assert refused["restored"] == 0 and refused["failed"][0]["code"] in ("forbidden", "not_found")
