"""Multiple calendars (FR-CAL-32, C-08, D-82): every user has one default calendar from the start; the owner moves the
default, archives and unarchives through sync; the default can be neither archived nor deleted, an archived calendar
not made the default; an archived calendar is read-only and its reminders do not fire; hidden calendars are a user
setting. Marker `db`.

+++===+++ 2026-10-29 — Hasan Alizada — HAAL-094 (stage 1).
"""

from __future__ import annotations

import uuid
from typing import Any

import pytest
from fastapi.testclient import TestClient

from .test_reminders import _as, _event, _reminder, _run, _schedule, utc
from .test_sharing import People
from .test_sync import _m, _pull, _push


@pytest.fixture
def people(api: TestClient, clean_db: str) -> People:
    return People(api, clean_db)


def _calendars(people: People, name: str) -> list[tuple[Any, ...]]:
    return _as(
        people,
        name,
        "SELECT name, is_default, archived_at IS NOT NULL, version FROM calendar "
        "WHERE owner_id = %s AND deleted_at IS NULL ORDER BY created_at",
        people.ids[name],
    )


def _default_id(people: People, name: str) -> str:
    [(found,)] = _as(
        people, name, "SELECT id::text FROM calendar WHERE owner_id = %s AND is_default", people.ids[name]
    )
    return str(found)


def _update(
    people: People, headers: dict[str, str], calendar: str, base: dict[str, Any], data: dict[str, Any]
) -> Any:
    return _push(people.api, headers, _m("calendar", calendar, "update", base=base, data=data))[0]


@pytest.mark.db
def test_every_user_starts_with_one_default_calendar(people: People) -> None:
    for name in ("ada", "bob", "cid"):
        assert _calendars(people, name)[0][:3] == ("My calendar", True, False)
    people.as_("ada")
    pulled = [c for c in _pull(people.api)["changes"] if c["entity_type"] == "calendar"]
    assert {c["data"]["name"]: c["data"]["is_default"] for c in pulled} == {
        "My calendar": True,
        "Family": False,
    }


@pytest.mark.db
def test_the_default_moves_and_stays_one(people: People) -> None:
    ada = people.as_("ada")
    first = _default_id(people, "ada")
    moved = _update(people, ada, people.calendar, {"is_default": False}, {"is_default": True})
    assert moved["status"] == "applied", moved
    assert _default_id(people, "ada") == people.calendar
    assert _calendars(people, "ada") == [("My calendar", False, False, 2), ("Family", True, False, 2)]
    pulled = {
        c["entity_id"]: c["data"] for c in _pull(people.api)["changes"] if c["entity_type"] == "calendar"
    }
    assert pulled[first]["is_default"] is False and pulled[people.calendar]["is_default"] is True

    unset = _update(people, ada, people.calendar, {"is_default": True}, {"is_default": False})
    assert unset["status"] == "rejected" and unset["problem"]["status"] == 409
    deleted = _push(people.api, ada, _m("calendar", people.calendar, "delete"))[0]
    assert deleted["status"] == "rejected" and deleted["problem"]["status"] == 409
    archived = _update(
        people, ada, people.calendar, {"archived_at": None}, {"archived_at": "2026-10-29T10:00:00Z"}
    )
    assert archived["status"] == "rejected" and archived["problem"]["status"] == 409
    # The former default is an ordinary calendar now: it can go.
    assert _push(people.api, ada, _m("calendar", first, "delete"))[0]["status"] == "applied"

    bob = people.as_("bob")
    foreign = _update(people, bob, _default_id(people, "ada"), {"is_default": True}, {"is_default": True})
    assert foreign["status"] == "rejected" and foreign["problem"]["status"] in (403, 404)


@pytest.mark.db
def test_an_archived_calendar_is_read_only_and_comes_back(people: People) -> None:
    assert people.share(people.as_("ada"), "bob@example.org", "edit").status_code == 201
    ada = people.as_("ada")
    event = _event(people, ada)
    archived = _update(
        people, ada, people.calendar, {"archived_at": None}, {"archived_at": "2000-01-01T00:00:00Z"}
    )
    assert archived["status"] == "applied", archived
    [(stamp,)] = _as(people, "ada", "SELECT archived_at FROM calendar WHERE id = %s", people.calendar)
    assert stamp.year >= 2026  # the server's time, not the client's

    refused = [
        _push(
            people.api, ada, _m("item", event, "update", base={"title": "Dentist"}, data={"title": "Doctor"})
        )[0],
        _push(people.api, ada, _m("item", event, "delete"))[0],
        _push(
            people.api,
            ada,
            _m(
                "item",
                str(uuid.uuid7()),
                "create",
                data={
                    "kind": "event",
                    "container_kind": "calendar",
                    "container_id": people.calendar,
                    "title": "New",
                    "start_date": "2026-11-12",
                },
            ),
        )[0],
    ]
    bob = people.as_("bob")
    refused.append(
        _push(
            people.api, bob, _m("item", event, "update", base={"title": "Dentist"}, data={"title": "Doctor"})
        )[0]
    )
    assert [(r["status"], r["problem"]["status"]) for r in refused] == [("rejected", 409)] * 4
    ada = people.as_("ada")
    not_default = _update(people, ada, people.calendar, {"is_default": False}, {"is_default": True})
    assert not_default["status"] == "rejected" and not_default["problem"]["status"] == 409
    # Renaming stays possible; the pulled row carries the archive time.
    assert (
        _update(people, ada, people.calendar, {"name": "Family"}, {"name": "Old family"})["status"]
        == "applied"
    )
    pulled = [c["data"] for c in _pull(people.api)["changes"] if c["entity_id"] == people.calendar]
    assert pulled[0]["archived_at"] is not None and pulled[0]["name"] == "Old family"

    # Unarchived from a device that saw it archived (base: its archive time as pulled).
    back = _update(
        people, ada, people.calendar, {"archived_at": pulled[0]["archived_at"]}, {"archived_at": None}
    )
    assert back["status"] == "applied", back
    edited = _push(
        people.api, ada, _m("item", event, "update", base={"title": "Dentist"}, data={"title": "Doctor"})
    )
    assert edited[0]["status"] == "applied"


@pytest.mark.db
def test_reminders_of_an_archived_calendar_do_not_fire(people: People) -> None:
    ada = people.as_("ada")
    event = _event(people, ada)  # 10 November 11:00 Berlin
    reminder = _reminder(people, ada, event, offset_minutes=15)
    assert _run(people, utc(2026, 11, 1)) == {"checked": 1}

    _update(people, ada, people.calendar, {"archived_at": None}, {"archived_at": "2026-11-02T00:00:00Z"})
    assert _schedule(people, "ada", reminder["id"])[0] is True  # marked to check
    assert _run(people, utc(2026, 11, 2)) == {"idle": 1}
    assert _schedule(people, "ada", reminder["id"])[:2] == (False, None)
    assert _run(people, utc(2026, 11, 10, 9, 45)) == {}

    ada = people.as_("ada")
    pulled = [c["data"] for c in _pull(people.api)["changes"] if c["entity_id"] == people.calendar]
    _update(people, ada, people.calendar, {"archived_at": pulled[0]["archived_at"]}, {"archived_at": None})
    assert _run(people, utc(2026, 11, 3)) == {"checked": 1}
    assert _schedule(people, "ada", reminder["id"])[1] == utc(2026, 11, 10, 9, 45)


@pytest.mark.db
def test_hidden_calendars_are_a_setting(people: People) -> None:
    ada = people.as_("ada")
    current = people.api.get("/api/v1/me/settings", headers=ada)
    assert current.json()["hidden_calendars"] == []
    hidden = sorted([people.calendar, _default_id(people, "bob")])
    patched = people.api.patch(
        "/api/v1/me/settings",
        json={"hidden_calendars": [hidden[1], hidden[0], hidden[1]]},
        headers={
            **ada,
            "If-Match": f'"{current.json()["version"]}"',
            "Content-Type": "application/merge-patch+json",
        },
    )
    assert patched.status_code == 200, patched.text
    assert patched.json()["hidden_calendars"] == hidden
