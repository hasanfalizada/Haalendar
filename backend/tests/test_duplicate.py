"""Duplicating an event (FR-CAL-34, D-84): the copy is an ordinary item create through sync that names the event it was
copied from; the server gives it that event's live attachments (new rows, the same stored files), written by the user
who duplicates — also on a calendar shared for editing; a source the user cannot read, or one deleted meanwhile, gives
none; deleting the copy (its undo) takes its attachments along and leaves the source's. Marker `db`.

+++===+++ 2026-10-29 — Hasan Alizada — HAAL-096.
"""

from __future__ import annotations

import uuid
from typing import Any
from urllib.parse import quote

import pytest
from fastapi.testclient import TestClient

from .test_attachments import png
from .test_reminders import _as, _event
from .test_sharing import People
from .test_sync import _m, _push


@pytest.fixture
def people(api: TestClient, clean_db: str) -> People:
    return People(api, clean_db)


def _upload(people: People, headers: dict[str, str], item: str, name: str) -> str:
    response = people.api.post(
        f"/api/v1/items/{item}/attachments",
        content=png(),
        headers={**headers, "Content-Type": "image/png", "X-File-Name": quote(name)},
    )
    assert response.status_code == 201, response.text
    return str(response.json()["id"])


def _duplicate(
    people: People, headers: dict[str, str], source: str, calendar: str | None = None, **data: Any
) -> tuple[str, dict[str, Any]]:
    copy = str(uuid.uuid7())
    body = {
        "kind": "event",
        "container_kind": "calendar",
        "container_id": calendar or people.calendar,
        "title": "Dentist",
        "all_day": False,
        "start_date": "2026-11-12",
        "start_time": "11:00",
        "end_date": "2026-11-12",
        "end_time": "12:00",
        "tzid": "Europe/Berlin",
        "copy_attachments_from": source,
        **data,
    }
    return copy, _push(people.api, headers, _m("item", copy, "create", data=body))[0]


def _attachments(people: People, item: str) -> list[tuple[Any, ...]]:
    return _as(
        people,
        "ada",
        "SELECT file_name, storage_key, thumbnail_key, uploaded_by::text, deleted_at IS NOT NULL "
        "FROM attachment WHERE item_id = %s ORDER BY created_at, id",
        item,
    )


@pytest.mark.db
def test_the_copy_takes_the_live_attachments_and_its_delete_leaves_the_source_alone(people: People) -> None:
    ada = people.as_("ada")
    source = _event(people, ada)
    _upload(people, ada, source, "plan.png")
    gone = _upload(people, ada, source, "old.png")
    assert people.api.delete(f"/api/v1/attachments/{gone}", headers=ada).status_code == 200

    copy, result = _duplicate(people, ada, source)
    assert result["status"] == "applied", result
    [original, _] = _attachments(people, source)
    copied = _attachments(people, copy)
    assert copied == [("plan.png", original[1], original[2], people.ids["ada"], False)]
    listed = people.api.get(f"/api/v1/items/{copy}/attachments").json()["data"]
    assert [a["file_name"] for a in listed] == ["plan.png"]
    assert people.api.get(listed[0]["url"]).status_code == 200
    assert people.api.get(listed[0]["thumbnail_url"]).status_code == 200

    assert _push(people.api, ada, _m("item", copy, "delete"))[0]["status"] == "applied"
    assert [row[4] for row in _attachments(people, copy)] == [True]
    assert [row[4] for row in _attachments(people, source)] == [False, True]
    assert _push(people.api, ada, _m("item", copy, "restore"))[0]["status"] == "applied"
    assert [row[4] for row in _attachments(people, copy)] == [False]


@pytest.mark.db
def test_rights_shared_for_editing_no_access_and_a_deleted_source(people: People) -> None:
    ada = people.as_("ada")
    source = _event(people, ada)
    _upload(people, ada, source, "plan.png")
    assert people.share(ada, "bob@example.org", "edit").status_code == 201

    bob = people.as_("bob")
    copy, result = _duplicate(people, bob, source)
    assert result["status"] == "applied", result
    assert [(row[0], row[3]) for row in _attachments(people, copy)] == [("plan.png", people.ids["bob"])]

    # Cid cannot read Ada's calendar: his own event is created, nothing of hers comes along.
    cid = people.as_("cid")
    [(own,)] = _as(
        people, "cid", "SELECT id::text FROM calendar WHERE owner_id = %s AND is_default", people.ids["cid"]
    )
    mine, result = _duplicate(people, cid, source, own)
    assert result["status"] == "applied", result
    assert _as(people, "ada", "SELECT count(*) FROM attachment WHERE item_id = %s", mine) == [(0,)]

    ada = people.as_("ada")
    assert _push(people.api, ada, _m("item", source, "delete"))[0]["status"] == "applied"
    late, result = _duplicate(people, ada, source)
    assert result["status"] == "applied", result
    assert _attachments(people, late) == []

    _, result = _duplicate(people, ada, source, copy_attachments_from="not an id")
    assert result["status"] == "rejected"
