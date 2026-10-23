"""Events in the unified trash (FR-CAL-09, FR-X-04, D-66): a deleted event is one entry with its attachments inside,
restored with them by the calendar's owner or an edit share (not a view share); while its calendar is in the trash it
is refused with parent_in_trash; deleted with its calendar it is shown inside the calendar's entry, and restoring the
calendar brings it back. Other item kinds never pass as events. Marker `db`.

+++===+++ 2026-10-23 — Hasan Alizada — HAAL-065.
"""

from __future__ import annotations

import uuid
from typing import Any
from urllib.parse import quote

import pytest
from fastapi.testclient import TestClient

from .test_attachments import png
from .test_sharing import People
from .test_sync import _m, _push

pytestmark = pytest.mark.db


@pytest.fixture
def people(api: TestClient, clean_db: str) -> People:
    return People(api, clean_db)


def _event(people: People, headers: dict[str, str], title: str) -> str:
    event_id = str(uuid.uuid7())
    data = {"kind": "event", "container_kind": "calendar", "container_id": people.calendar, "title": title}
    data["start_date"] = "2026-10-22"
    assert _push(people.api, headers, _m("item", event_id, "create", data=data))[0]["status"] == "applied"
    return event_id


def _attach(people: People, headers: dict[str, str], event_id: str) -> None:
    response = people.api.post(
        f"/api/v1/items/{event_id}/attachments",
        content=png(),
        headers={**headers, "Content-Type": "image/png", "X-File-Name": quote("plan.png")},
    )
    assert response.status_code == 201, response.text


def _trash(people: People) -> list[tuple[str, str, dict[str, int]]]:
    response = people.api.get("/api/v1/trash")
    assert response.status_code == 200, response.text
    return [(e["type"], e["title"], e["contents"]) for e in response.json()["data"]]


def _restore(people: People, headers: dict[str, str], kind: str, entry_id: str) -> dict[str, Any]:
    response = people.api.post(
        "/api/v1/trash/restore", json={"entries": [{"type": kind, "id": entry_id}]}, headers=headers
    )
    assert response.status_code == 200, response.text
    result: dict[str, Any] = response.json()
    return result


def test_deleted_event_is_one_entry_with_its_attachments_and_restores_them(people: People) -> None:
    ada = people.as_("ada")
    dentist = _event(people, ada, "Dentist")
    _attach(people, ada, dentist)
    assert _push(people.api, ada, _m("item", dentist, "delete"))[0]["status"] == "applied"

    assert _trash(people) == [("event", "Dentist", {"attachment": 1})]  # the attachment is inside, not beside
    events = people.api.get("/api/v1/trash", params={"module": "event"}).json()["data"]
    assert [e["id"] for e in events] == [dentist]

    result = _restore(people, ada, "event", dentist)
    assert result["restored"] == 1 and result["rows"] == 2 and result["failed"] == []
    assert _trash(people) == []
    listed = people.api.get(f"/api/v1/items/{dentist}/attachments").json()["data"]
    assert [a["file_name"] for a in listed] == ["plan.png"]


def test_restoring_needs_edit_access(people: People) -> None:
    ada = people.as_("ada")
    assert people.share(ada, "bob@example.org", "view").status_code == 201
    assert people.share(ada, "cid@example.org", "edit").status_code == 201
    party = _event(people, ada, "Party")
    _push(people.api, ada, _m("item", party, "delete"))

    bob = people.as_("bob")
    assert _trash(people) == []  # a view share does not see what it may not restore
    assert _restore(people, bob, "event", party)["failed"][0]["code"] in {"not_found", "forbidden"}

    cid = people.as_("cid")
    assert _trash(people) == [("event", "Party", {})]
    assert _restore(people, cid, "event", party)["restored"] == 1


def test_event_with_its_calendar(people: People) -> None:
    ada = people.as_("ada")
    alone = _event(people, ada, "Deleted alone")
    together = _event(people, ada, "Deleted with the calendar")
    _attach(people, ada, together)
    _push(people.api, ada, _m("item", alone, "delete"))
    _push(people.api, ada, _m("calendar", people.calendar, "delete"))

    trash = _trash(people)
    assert ("calendar", "Family", {"event": 1, "attachment": 1}) in trash
    assert ("event", "Deleted alone", {}) in trash and len(trash) == 2

    refused = _restore(people, ada, "event", alone)["failed"][0]
    assert refused["code"] == "parent_in_trash" and refused["parent"]["id"] == people.calendar

    restored = _restore(people, ada, "calendar", people.calendar)
    assert restored["restored"] == 1 and restored["rows"] == 3  # calendar, its event and the attachment
    assert _trash(people) == [("event", "Deleted alone", {})]
    assert _restore(people, ada, "event", alone)["restored"] == 1


def test_other_item_kinds_do_not_pass_as_events(people: People) -> None:
    ada = people.as_("ada")
    assert _restore(people, ada, "event", str(uuid.uuid7()))["failed"][0]["code"] == "not_found"
