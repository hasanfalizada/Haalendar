"""Sharing API (FR-ACC-10): share by e-mail, list granted/received, change permission with If-Match, revoke, leave,
and the effect on row-level security (marker `db`).

+++===+++ 2026-10-15 — Hasan Alizada — HAAL-167.
"""

from __future__ import annotations

import uuid
from typing import Any

import psycopg
import pytest
from fastapi.testclient import TestClient
from sqlalchemy.engine import make_url

from .account_helpers import create_user, login, sql

pytestmark = pytest.mark.db

MERGE = "application/merge-patch+json"


def _dsn(url: str) -> str:
    return make_url(url).set(drivername="postgresql").render_as_string(hide_password=False)


def _visible_calendars(db_url: str, user_id: str) -> int:
    with psycopg.connect(_dsn(db_url), autocommit=True) as conn:
        conn.execute("SELECT set_config('app.user_id', %s, false)", (user_id,))
        row = conn.execute("SELECT count(*) FROM calendar").fetchone()
        return int(row[0]) if row else 0


def _calendar(db_url: str, owner_id: str, name: str = "Family") -> str:
    calendar_id = str(uuid.uuid7())
    with psycopg.connect(_dsn(db_url), autocommit=True) as conn:
        conn.execute("SELECT set_config('app.user_id', %s, false)", (owner_id,))
        conn.execute(
            "INSERT INTO calendar (id, owner_id, name) VALUES (%s, %s, %s)", (calendar_id, owner_id, name)
        )
    return calendar_id


class People:
    def __init__(self, api: TestClient, db_url: str) -> None:
        self.api, self.db_url = api, db_url
        for name in ("ada", "bob", "cid"):
            create_user(api, db_url, f"{name}@example.org")
        rows = sql(db_url, "SELECT email, id FROM user_account")
        self.ids = {str(email).split("@")[0]: str(user_id) for email, user_id in rows}
        sql(db_url, "UPDATE user_account SET display_name = initcap(split_part(email, '@', 1))")
        self.calendar = _calendar(db_url, self.ids["ada"])

    def as_(self, name: str) -> dict[str, str]:
        status, body = login(self.api, f"{name}@example.org")
        assert status == 200
        token = body["csrf_token"]
        assert isinstance(token, str)
        return {"X-CSRF-Token": token}

    def share(self, headers: dict[str, str], email: str, permission: str = "view", **extra: object) -> Any:
        body = {"container_kind": "calendar", "container_id": self.calendar, "grantee_email": email}
        return self.api.post(
            "/api/v1/shares", json={**body, "permission": permission, **extra}, headers=headers
        )


@pytest.fixture
def people(api: TestClient, clean_db: str) -> People:
    return People(api, clean_db)


def test_share_list_and_access(people: People, clean_db: str) -> None:
    ada = people.as_("ada")
    assert _visible_calendars(clean_db, people.ids["bob"]) == 0
    created = people.share(ada, "BOB@Example.org")
    assert created.status_code == 201
    share = created.json()
    assert (
        share["container_name"] == "Family"
        and share["grantee_name"] == "Bob"
        and share["owner_name"] == "Ada"
    )
    assert share["permission"] == "view" and share["version"] == 1 and share["revoked_at"] is None
    granted = people.api.get("/api/v1/shares").json()["data"]
    assert [s["id"] for s in granted] == [share["id"]]
    assert _visible_calendars(clean_db, people.ids["bob"]) == 1

    people.as_("bob")
    received = people.api.get("/api/v1/shares", params={"direction": "received"}).json()["data"]
    assert [s["owner_name"] for s in received] == ["Ada"]
    assert people.api.get("/api/v1/shares").json()["data"] == []  # Bob owns nothing


@pytest.mark.parametrize(
    ("email", "extra", "status", "code"),
    [
        ("nobody@example.org", {}, 422, "user_not_found"),
        ("ada@example.org", {}, 422, "self"),
        ("bob@example.org", {"container_kind": "board"}, 422, "unsupported"),
    ],
)
def test_share_validation(people: People, email: str, extra: dict[str, str], status: int, code: str) -> None:
    response = people.share(people.as_("ada"), email, **extra)
    assert response.status_code == status
    assert response.json()["errors"][0]["code"] == code


def test_inactive_users_cannot_receive_shares(people: People, clean_db: str) -> None:
    sql(clean_db, "UPDATE user_account SET deactivated_at = now() WHERE email = 'bob@example.org'")
    sql(clean_db, "UPDATE user_account SET email_verified_at = NULL WHERE email = 'cid@example.org'")
    ada = people.as_("ada")
    for email in ("bob@example.org", "cid@example.org"):
        assert people.share(ada, email).json()["errors"][0]["code"] == "user_not_found"


def test_duplicate_foreign_and_non_owner_shares(people: People) -> None:
    ada = people.as_("ada")
    assert people.share(ada, "bob@example.org", "edit").status_code == 201
    assert people.share(ada, "bob@example.org").status_code == 409

    bob = people.as_("bob")  # edit share: may edit items, not share further
    assert people.share(bob, "cid@example.org").status_code == 403
    cid = people.as_("cid")  # cannot even see the calendar
    assert people.share(cid, "bob@example.org").status_code == 404


def test_change_permission_with_if_match(people: People) -> None:
    ada = people.as_("ada")
    share_id = people.share(ada, "bob@example.org").json()["id"]
    url = f"/api/v1/shares/{share_id}"
    headers = {**ada, "Content-Type": MERGE}
    assert people.api.patch(url, json={"permission": "edit"}, headers=headers).status_code == 428
    stale = people.api.patch(url, json={"permission": "edit"}, headers={**headers, "If-Match": '"5"'})
    assert stale.status_code == 412 and stale.json()["current"]["permission"] == "view"
    changed = people.api.patch(url, json={"permission": "edit"}, headers={**headers, "If-Match": '"1"'})
    assert changed.status_code == 200 and changed.json()["permission"] == "edit"
    assert changed.headers["ETag"] == '"2"'

    bob = people.as_("bob")
    refused = people.api.patch(
        url, json={"permission": "view"}, headers={**bob, "Content-Type": MERGE, "If-Match": '"2"'}
    )
    assert refused.status_code == 403


def test_revoke_removes_access_and_allows_resharing(people: People, clean_db: str) -> None:
    ada = people.as_("ada")
    share_id = people.share(ada, "bob@example.org").json()["id"]
    cid = people.as_("cid")
    assert people.api.delete(f"/api/v1/shares/{share_id}", headers=cid).status_code == 404  # stranger

    ada = people.as_("ada")
    assert people.api.delete(f"/api/v1/shares/{share_id}", headers=ada).status_code == 204
    assert people.api.delete(f"/api/v1/shares/{share_id}", headers=ada).status_code == 404
    assert _visible_calendars(clean_db, people.ids["bob"]) == 0
    assert people.share(ada, "bob@example.org").status_code == 201
    assert sql(clean_db, "SELECT count(*) FROM share") == [(0,)]  # app role without context sees none…
    with psycopg.connect(_dsn(clean_db), autocommit=True) as conn:
        conn.execute("SELECT set_config('app.user_id', %s, false)", (people.ids["ada"],))
        rows = conn.execute("SELECT revoked_at IS NULL FROM share ORDER BY created_at").fetchall()
    assert rows == [(False,), (True,)]  # …the owner sees the revoked row kept and the new one


def test_grantee_can_leave(people: People, clean_db: str) -> None:
    ada = people.as_("ada")
    share_id = people.share(ada, "bob@example.org", "edit").json()["id"]
    bob = people.as_("bob")
    assert people.api.delete(f"/api/v1/shares/{share_id}", headers=bob).status_code == 204
    assert _visible_calendars(clean_db, people.ids["bob"]) == 0
    assert people.api.get("/api/v1/shares", params={"direction": "received"}).json()["data"] == []


def test_sharing_requires_sign_in(api: TestClient) -> None:
    assert api.get("/api/v1/shares").status_code == 401
