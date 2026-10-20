"""Notification center (FR-X-21, D-52): notifications written by the share trigger (granted, revoked by the owner, none
when the grantee leaves), listing newest first with keyset pages and the unread count, marking read (ids / all),
owner-only access, the read-state guard, no physical delete (marker `db`).

+++===+++ 2026-10-19 — Hasan Alizada — HAAL-048.
"""

from __future__ import annotations

import uuid
from typing import Any

import psycopg
import pytest
from fastapi.testclient import TestClient
from sqlalchemy.engine import make_url

from .test_sharing import People

pytestmark = pytest.mark.db


def _dsn(url: str) -> str:
    return make_url(url).set(drivername="postgresql").render_as_string(hide_password=False)


@pytest.fixture
def people(api: TestClient, clean_db: str) -> People:
    return People(api, clean_db)


def _list(api: TestClient, query: str = "") -> dict[str, Any]:
    response = api.get(f"/api/v1/notifications{query}")
    assert response.status_code == 200
    body = response.json()
    assert isinstance(body, dict)
    return body


def test_share_notifications(people: People) -> None:
    ada = people.as_("ada")
    share_id = people.share(ada, "bob@example.org", "edit").json()["id"]
    assert _list(people.api)["unread_count"] == 0  # Ada is told nothing about her own action
    assert people.api.delete(f"/api/v1/shares/{share_id}", headers=ada).status_code == 204

    people.as_("bob")
    page = _list(people.api)
    assert page["unread_count"] == 2
    data = page["data"]
    assert isinstance(data, list)
    assert [n["kind"] for n in data] == ["share_revoked", "share_received"]  # newest first
    received = data[1]
    assert received["read_at"] is None and received["item_id"] is None
    assert received["payload"] == {
        "share_id": share_id,
        "container_kind": "calendar",
        "container_id": people.calendar,
        "container_name": "Family",
        "by_name": "Ada",
        "permission": "edit",
    }


def test_leaving_a_share_notifies_nobody(people: People) -> None:
    people.share(people.as_("ada"), "bob@example.org")
    bob = people.as_("bob")
    share_id = _list(people.api)["data"][0]["payload"]["share_id"]
    assert people.api.delete(f"/api/v1/shares/{share_id}", headers=bob).status_code == 204
    assert _list(people.api)["unread_count"] == 1  # still only "shared with you"
    people.as_("ada")
    assert _list(people.api)["unread_count"] == 0


def test_mark_read_and_pages(people: People, clean_db: str) -> None:
    ada = people.as_("ada")
    for _ in range(3):  # three rounds of grant + revoke → six notifications for Bob
        share_id = people.share(ada, "bob@example.org").json()["id"]
        people.api.delete(f"/api/v1/shares/{share_id}", headers=ada)
    bob = people.as_("bob")
    first = _list(people.api, "?limit=4")
    assert len(first["data"]) == 4 and first["unread_count"] == 6
    rest = _list(people.api, f"?limit=4&cursor={first['next_cursor']}")
    assert len(rest["data"]) == 2 and rest["next_cursor"] is None

    one = first["data"][0]["id"]
    assert people.api.post("/api/v1/notifications/read", json={"ids": [one]}, headers=bob).status_code == 204
    assert _list(people.api)["unread_count"] == 5
    assert len(_list(people.api, "?unread=true")["data"]) == 5
    assert people.api.post("/api/v1/notifications/read", json={"all": True}, headers=bob).status_code == 204
    after = _list(people.api)
    assert after["unread_count"] == 0
    assert all(n["read_at"] for n in after["data"])

    assert people.api.post("/api/v1/notifications/read", json={}, headers=bob).status_code == 422
    assert people.api.get("/api/v1/notifications?cursor=%%%").status_code == 400


def test_only_the_owner_sees_and_marks(people: People, clean_db: str, db_url: str) -> None:
    people.share(people.as_("ada"), "bob@example.org")
    cid = people.as_("cid")
    with psycopg.connect(_dsn(db_url), autocommit=True) as conn:
        conn.execute("SELECT set_config('app.user_id', %s, false)", (people.ids["bob"],))
        note = conn.execute("SELECT id FROM notification").fetchone()
        assert note is not None
    # Cid marks Bob's notification: nothing happens to it.
    assert (
        people.api.post("/api/v1/notifications/read", json={"ids": [str(note[0])]}, headers=cid).status_code
        == 204
    )
    assert _list(people.api)["data"] == []
    with psycopg.connect(_dsn(db_url), autocommit=True) as conn:
        conn.execute("SELECT set_config('app.user_id', %s, false)", (people.ids["cid"],))
        assert conn.execute("SELECT count(*) FROM notification").fetchone() == (0,)
        planted = conn.execute(
            "INSERT INTO notification (id, owner_id, kind) VALUES (%s, %s, 'reminder') RETURNING id",
            (uuid.uuid7(), people.ids["cid"]),
        ).fetchone()
        assert planted is not None
        with pytest.raises(psycopg.errors.InsufficientPrivilege):
            conn.execute(
                "INSERT INTO notification (id, owner_id, kind) VALUES (%s, %s, 'reminder')",
                (uuid.uuid7(), people.ids["bob"]),
            )
    with psycopg.connect(_dsn(db_url), autocommit=True) as conn:
        conn.execute("SELECT set_config('app.user_id', %s, false)", (people.ids["bob"],))
        assert conn.execute("SELECT read_at FROM notification").fetchone() == (None,)
        with pytest.raises(psycopg.errors.CheckViolation):
            conn.execute('UPDATE notification SET payload = \'{"by_name": "forged"}\'')
        conn.execute("UPDATE notification SET read_at = now()")  # the read state may change
        with pytest.raises(psycopg.errors.InsufficientPrivilege):
            conn.execute("DELETE FROM notification")


def test_notifications_need_a_session(api: TestClient) -> None:
    assert api.get("/api/v1/notifications").status_code == 401
