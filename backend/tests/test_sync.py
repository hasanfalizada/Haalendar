"""Sync API (FR-OFF-02..04, ADR-0009, D-56): pull by cursor (pages, increments, soft deletes, transactions that commit
late, tombstones, content of a newly shared container, isolation) and push (calendar and item changes, exactly once,
field-level conflicts and merges, rights, validation). Marker `db`.

+++===+++ 2026-10-21 — Hasan Alizada — HAAL-053.
"""

from __future__ import annotations

import uuid
from typing import Any

import psycopg
import pytest
from fastapi.testclient import TestClient

from haalendar.sync.sql import SYNCED_TABLES

from .test_isolation import _dsn, as_user
from .test_sharing import People

pytestmark = pytest.mark.db


@pytest.fixture
def people(api: TestClient, clean_db: str) -> People:
    return People(api, clean_db)


def _items(db_url: str, owner: str, calendar: str, titles: list[str]) -> list[str]:
    ids = [str(uuid.uuid7()) for _ in titles]
    with as_user(db_url, uuid.UUID(owner)) as conn:
        for item_id, title in zip(ids, titles, strict=True):
            conn.execute(
                "INSERT INTO item (id, kind, owner_id, container_kind, container_id, title, created_by) "
                "VALUES (%s, 'event', %s, 'calendar', %s, %s, %s)",
                (item_id, owner, calendar, title, owner),
            )
    return ids


def _pull(api: TestClient, since: str | None = None, limit: int = 500) -> dict[str, Any]:
    params: dict[str, Any] = {"limit": limit}
    if since:
        params["since"] = since
    response = api.get("/api/v1/sync/pull", params=params)
    assert response.status_code == 200, response.text
    body = response.json()
    assert isinstance(body, dict)
    return body


def _ids(body: dict[str, Any], entity: str) -> list[str]:
    return [c["entity_id"] for c in body["changes"] if c["entity_type"] == entity and c["op"] == "upsert"]


def _push(api: TestClient, headers: dict[str, str], *mutations: dict[str, Any]) -> list[dict[str, Any]]:
    response = api.post("/api/v1/sync/push", json={"mutations": list(mutations)}, headers=headers)
    assert response.status_code == 200, response.text
    results = response.json()["results"]
    assert isinstance(results, list)
    return results


def _m(entity: str, entity_id: str, op: str, **extra: Any) -> dict[str, Any]:
    return {
        "mutation_id": str(uuid.uuid7()),
        "entity_type": entity,
        "entity_id": entity_id,
        "op": op,
        **extra,
    }


# ---------- pull ----------


def test_every_synced_table_is_stamped(owner_db_url: str) -> None:
    with psycopg.connect(_dsn(owner_db_url), autocommit=True) as conn:
        stamped = {
            r[0]
            for r in conn.execute(
                "SELECT c.relname FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid "
                "WHERE t.tgname = 'haalendar_sync_stamp'"
            )
        }
    assert set(SYNCED_TABLES) <= stamped


def test_first_sync_in_pages_then_only_changes(people: People, clean_db: str) -> None:
    item_ids = _items(clean_db, people.ids["ada"], people.calendar, [f"Item {i}" for i in range(5)])
    people.as_("ada")
    seen: list[str] = []
    cursor = None
    pages = 0
    while True:
        body = _pull(people.api, cursor, limit=2)
        seen += [c["entity_id"] for c in body["changes"]]
        cursor, pages = body["cursor"], pages + 1
        if not body["has_more"]:
            break
    assert pages >= 3
    assert sorted(set(seen) & set(item_ids)) == sorted(item_ids)
    assert people.calendar in seen
    assert len(seen) == len(set(seen))  # nothing twice

    assert _pull(people.api, cursor)["changes"] == []
    with as_user(clean_db, uuid.UUID(people.ids["ada"])) as conn:
        conn.execute("UPDATE item SET title = 'renamed', version = version + 1 WHERE id = %s", (item_ids[0],))
    changes = _pull(people.api, cursor)["changes"]
    assert [(c["entity_id"], c["data"]["title"]) for c in changes] == [(item_ids[0], "renamed")]
    assert "sync_seq" not in changes[0]["data"] and "legacy_id" not in changes[0]["data"]


def test_a_transaction_that_commits_late_is_not_skipped(people: People, clean_db: str) -> None:
    slow_item, fast_item = _items(clean_db, people.ids["ada"], people.calendar, ["slow", "fast"])
    people.as_("ada")
    cursor = _pull(people.api)["cursor"]
    ada = people.ids["ada"]
    with psycopg.connect(_dsn(clean_db)) as slow:
        slow.execute("SELECT set_config('app.user_id', %s, false)", (ada,))
        slow.execute(
            "UPDATE item SET title = 'slow edit' WHERE id = %s", (slow_item,)
        )  # lower number, not committed
        with as_user(clean_db, uuid.UUID(ada)) as fast:
            fast.execute(
                "UPDATE item SET title = 'fast edit' WHERE id = %s", (fast_item,)
            )  # higher, committed
        first = _pull(people.api, cursor)
        assert _ids(first, "item") == [fast_item]
        slow.commit()
    second = _pull(people.api, first["cursor"])
    assert _ids(second, "item") == [slow_item]
    assert _pull(people.api, second["cursor"])["changes"] == []


def test_new_share_brings_the_content_and_revoking_sends_a_tombstone(people: People, clean_db: str) -> None:
    item_ids = _items(clean_db, people.ids["ada"], people.calendar, ["Dentist", "School"])
    ada = people.as_("ada")
    people.as_("bob")
    cursor = _pull(people.api)["cursor"]  # Bob sees nothing of Ada's yet

    ada = people.as_("ada")
    share_id = people.share(ada, "bob@example.org").json()["id"]
    people.as_("bob")
    after_share = _pull(people.api, cursor)
    assert _ids(after_share, "share") == [share_id]
    assert people.calendar in _ids(after_share, "calendar")
    assert sorted(_ids(after_share, "item")) == sorted(item_ids)

    ada = people.as_("ada")
    assert people.api.delete(f"/api/v1/shares/{share_id}", headers=ada).status_code == 204
    people.as_("bob")
    after_revoke = _pull(people.api, after_share["cursor"])
    tombstones = [
        (c["entity_type"], c["entity_id"]) for c in after_revoke["changes"] if c["op"] == "tombstone"
    ]
    assert tombstones == [("calendar", people.calendar)]


def test_soft_deletes_travel_and_strangers_see_nothing(people: People, clean_db: str) -> None:
    (item_id,) = _items(clean_db, people.ids["ada"], people.calendar, ["Gym"])
    ada = people.as_("ada")
    cursor = _pull(people.api)["cursor"]
    assert _push(people.api, ada, _m("item", item_id, "delete"))[0]["status"] == "applied"
    deleted = [c for c in _pull(people.api, cursor)["changes"] if c["entity_id"] == item_id]
    assert deleted[0]["data"]["deleted_at"] is not None

    people.as_("cid")
    everything = _pull(people.api)
    assert people.calendar not in _ids(everything, "calendar") and item_id not in _ids(everything, "item")


def test_a_bad_cursor_starts_over(people: People) -> None:
    people.as_("ada")
    response = people.api.get("/api/v1/sync/pull", params={"since": "not-a-cursor"})
    assert response.status_code == 410 and response.json()["code"] == "cursor_invalid"


# ---------- push ----------


def test_calendar_changes_exactly_once(people: People, clean_db: str) -> None:
    ada = people.as_("ada")
    calendar_id = str(uuid.uuid7())
    create = _m("calendar", calendar_id, "create", data={"name": " Trips ", "color": "green"})
    first = _push(people.api, ada, create)[0]
    assert first["status"] == "applied" and first["version"] == 1
    again = _push(people.api, ada, create)[0]
    assert again["status"] == "duplicate" and again["version"] == 1

    rename = _m(
        "calendar", calendar_id, "update", base_version=1, base={"name": "Trips"}, data={"name": "Travel"}
    )
    delete = _m("calendar", calendar_id, "delete")
    restore = _m("calendar", calendar_id, "restore")
    results = _push(people.api, ada, rename, delete, restore)
    assert [r["status"] for r in results] == ["applied", "applied", "applied"]
    rows = people.api.get("/api/v1/sync/pull").json()["changes"]
    trips = next(c for c in rows if c["entity_id"] == calendar_id)
    assert trips["data"]["name"] == "Travel" and trips["data"]["deleted_at"] is None


def test_field_level_conflicts_and_merges(people: People, clean_db: str) -> None:
    ada = people.as_("ada")
    with as_user(clean_db, uuid.UUID(people.ids["ada"])) as conn:  # changed on another device meanwhile
        conn.execute(
            "UPDATE calendar SET name = 'Family (new)', version = version + 1 WHERE id = %s",
            (people.calendar,),
        )
    same_field = _m("calendar", people.calendar, "update", base={"name": "Family"}, data={"name": "Home"})
    result = _push(people.api, ada, same_field)[0]
    assert result["status"] == "conflict" and result["fields"] == ["name"]
    assert result["current"]["name"] == "Family (new)"  # the server value stays

    other_field = _m(
        "calendar",
        people.calendar,
        "update",
        base={"name": "Family (new)", "color": "blue"},
        data={"color": "red"},
    )
    merged = _push(people.api, ada, other_field)[0]
    assert merged["status"] == "applied"
    current = next(c for c in _pull(people.api)["changes"] if c["entity_id"] == people.calendar)["data"]
    assert (current["name"], current["color"]) == ("Family (new)", "red")


# +++===+++ 2026-10-22 — Hasan Alizada — HAAL-054. ADR-0009 rule 4: the delete applies; the client is told when the
# record had changed since the version it deleted.
def test_delete_of_a_record_changed_elsewhere_applies_and_says_so(people: People, clean_db: str) -> None:
    changed, untouched = _items(clean_db, people.ids["ada"], people.calendar, ["Dentist", "Gym"])
    ada = people.as_("ada")
    versions = {c["entity_id"]: c["version"] for c in _pull(people.api)["changes"]}
    seen = versions[changed]
    edit = _m("item", changed, "update", base={"title": "Dentist"}, data={"title": "Dentist 9:00"})
    assert _push(people.api, ada, edit)[0]["status"] == "applied"  # another device

    stale, fresh = _push(
        people.api,
        ada,
        _m("item", changed, "delete", base_version=seen),
        _m("item", untouched, "delete", base_version=versions[untouched]),
    )
    assert stale["status"] == "applied" and stale["edited_elsewhere"] is True
    assert fresh["status"] == "applied" and "edited_elsewhere" not in fresh
    deleted = {c["entity_id"]: c["data"]["deleted_at"] for c in _pull(people.api)["changes"]}
    assert deleted[changed] is not None and deleted[untouched] is not None


def test_rights_validation_and_unsupported_changes(people: People, clean_db: str) -> None:
    (item_id,) = _items(clean_db, people.ids["ada"], people.calendar, ["Dentist"])
    ada = people.as_("ada")
    people.share(ada, "bob@example.org", "view")
    people.share(ada, "cid@example.org", "edit")

    bob = people.as_("bob")
    viewer = _push(
        people.api, bob, _m("item", item_id, "update", base={"title": "Dentist"}, data={"title": "x"})
    )[0]
    assert viewer["status"] == "rejected" and viewer["problem"]["code"] == "forbidden"
    not_owner = _push(people.api, bob, _m("calendar", people.calendar, "delete"))[0]
    assert not_owner["problem"]["code"] == "forbidden"

    cid = people.as_("cid")
    editor = _push(
        people.api,
        cid,
        _m("item", item_id, "update", base={"title": "Dentist"}, data={"title": "Dentist 9:00"}),
    )
    assert editor[0]["status"] == "applied"
    invalid = _push(people.api, cid, _m("item", item_id, "update", data={"color": "pink"}))[0]
    assert invalid["status"] == "rejected" and invalid["problem"]["code"] == "validation_failed"
    create_item = _push(people.api, cid, _m("item", str(uuid.uuid7()), "create", data={"title": "new"}))[0]
    assert create_item["problem"]["code"] == "invalid_state"

    ada = people.as_("ada")
    _push(people.api, ada, _m("item", item_id, "delete"))
    cid = people.as_("cid")
    late = _push(
        people.api, cid, _m("item", item_id, "update", base={"title": "Dentist 9:00"}, data={"title": "y"})
    )[0]
    assert late["status"] == "rejected" and late["problem"]["code"] == "invalid_state"
    assert late["current"]["deleted_at"] is not None


def test_moving_an_item_and_reusing_another_users_mutation_id(people: People, clean_db: str) -> None:
    (item_id,) = _items(clean_db, people.ids["ada"], people.calendar, ["Dentist"])
    ada = people.as_("ada")
    other = str(uuid.uuid7())
    assert (
        _push(people.api, ada, _m("calendar", other, "create", data={"name": "Health"}))[0]["status"]
        == "applied"
    )
    move = _m(
        "item",
        item_id,
        "move",
        base={"container_kind": "calendar", "container_id": people.calendar},
        data={"container_kind": "calendar", "container_id": other},
    )
    assert _push(people.api, ada, move)[0]["status"] == "applied"
    moved = next(c for c in _pull(people.api)["changes"] if c["entity_id"] == item_id)["data"]
    assert moved["container_id"] == other

    bob = people.as_("bob")
    reused = {
        **move,
        "entity_type": "calendar",
        "entity_id": str(uuid.uuid7()),
        "op": "create",
        "data": {"name": "B"},
    }
    result = _push(people.api, bob, reused)[0]
    assert result["status"] == "rejected" and result["problem"]["code"] == "duplicate"


def test_push_limits(people: People) -> None:
    ada = people.as_("ada")
    empty = people.api.post("/api/v1/sync/push", json={"mutations": []}, headers=ada)
    assert empty.status_code == 422
