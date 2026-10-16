"""Unified trash (FR-X-04): newest deletions first, only what the user may restore, batch restore recorded in the
audit log, failure codes, nothing purged (marker `db`).

+++===+++ 2026-10-16 — Hasan Alizada — HAAL-033.
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


def _dsn(url: str) -> str:
    return make_url(url).set(drivername="postgresql").render_as_string(hide_password=False)


def _as(db_url: str, user_id: str) -> psycopg.Connection:
    conn = psycopg.connect(_dsn(db_url), autocommit=True)
    conn.execute("SELECT set_config('app.user_id', %s, false)", (user_id,))
    return conn


class Trash:
    def __init__(self, api: TestClient, db_url: str) -> None:
        self.api, self.db_url = api, db_url
        for name in ("ada", "bob", "cid"):
            create_user(api, db_url, f"{name}@example.org")
        sql(db_url, "UPDATE user_account SET display_name = initcap(split_part(email, '@', 1))")
        self.ids = {
            str(e).split("@")[0]: str(i) for e, i in sql(db_url, "SELECT email, id FROM user_account")
        }
        self.calendars: dict[str, str] = {}
        with _as(db_url, self.ids["ada"]) as conn:
            for name in ("Work", "Old", "Kept"):
                self.calendars[name] = str(uuid.uuid7())
                conn.execute(
                    "INSERT INTO calendar (id, owner_id, name) VALUES (%s, %s, %s)",
                    (self.calendars[name], self.ids["ada"], name),
                )
            # deleted two hours ago and ten minutes ago (newest first in the trash)
            for name, minutes in (("Old", 120), ("Work", 10)):
                conn.execute(
                    "UPDATE calendar SET deleted_at = now() - make_interval(mins => %s), delete_batch_id = %s, "
                    "updated_by = %s WHERE id = %s",
                    (minutes, uuid.uuid7(), self.ids["ada"], self.calendars[name]),
                )
            conn.execute(
                "INSERT INTO share (id, container_kind, container_id, grantee_id, permission, granted_by) "
                "VALUES (%s, 'calendar', %s, %s, 'edit', %s)",
                (uuid.uuid7(), self.calendars["Work"], self.ids["bob"], self.ids["ada"]),
            )

    def sign_in(self, name: str) -> dict[str, str]:
        status, body = login(self.api, f"{name}@example.org")
        assert status == 200
        return {"X-CSRF-Token": str(body["csrf_token"])}

    def restore(self, headers: dict[str, str], *entries: tuple[str, str]) -> dict[str, Any]:
        response = self.api.post(
            "/api/v1/trash/restore",
            json={"entries": [{"type": t, "id": i} for t, i in entries]},
            headers=headers,
        )
        assert response.status_code == 200, response.text
        result: dict[str, Any] = response.json()
        return result


@pytest.fixture
def trash(api: TestClient, clean_db: str) -> Trash:
    return Trash(api, clean_db)


def test_lists_newest_deletion_first_with_who_and_pagination(trash: Trash) -> None:
    trash.sign_in("ada")
    page = trash.api.get("/api/v1/trash").json()
    assert [e["title"] for e in page["data"]] == ["Work", "Old"] and page["next_cursor"] is None
    work = page["data"][0]
    assert work["type"] == "calendar" and work["deleted_by"] == trash.ids["ada"]
    assert work["deleted_by_name"] == "Ada" and work["contents"] == {}

    first = trash.api.get("/api/v1/trash", params={"limit": 1}).json()
    second = trash.api.get("/api/v1/trash", params={"limit": 1, "cursor": first["next_cursor"]}).json()
    assert [e["title"] for e in first["data"] + second["data"]] == ["Work", "Old"]
    assert second["next_cursor"] is None
    assert trash.api.get("/api/v1/trash", params={"module": "note"}).json()["data"] == []
    assert trash.api.get("/api/v1/trash", params={"cursor": "%%"}).status_code == 400


def test_containers_are_restored_only_by_their_owner(trash: Trash) -> None:
    trash.sign_in("bob")  # edit share on "Work", but containers belong to their owner
    assert trash.api.get("/api/v1/trash").json()["data"] == []
    bob = trash.sign_in("bob")
    result = trash.restore(bob, ("calendar", trash.calendars["Work"]), ("calendar", trash.calendars["Old"]))
    assert result["restored"] == 0
    assert result["failed"] == [
        {"type": "calendar", "id": trash.calendars["Work"], "code": "forbidden", "parent": None},
        {"type": "calendar", "id": trash.calendars["Old"], "code": "not_found", "parent": None},
    ]


def test_restore_brings_back_the_batch_and_is_audited(trash: Trash) -> None:
    ada = trash.sign_in("ada")
    work = trash.calendars["Work"]
    result = trash.restore(ada, ("calendar", work), ("calendar", work), ("note", str(uuid.uuid7())))
    assert result["restored"] == 1 and result["rows"] == 1  # duplicates count once
    assert result["failed"] == [
        {"type": "note", "id": result["failed"][0]["id"], "code": "unsupported", "parent": None}
    ]
    assert [e["title"] for e in trash.api.get("/api/v1/trash").json()["data"]] == ["Old"]
    again = trash.restore(ada, ("calendar", work))
    assert again["restored"] == 0 and again["failed"][0]["code"] == "not_found"

    with _as(trash.db_url, trash.ids["ada"]) as conn:
        audit = conn.execute(
            "SELECT action, actor_id::text FROM audit_log WHERE entity_id = %s ORDER BY id DESC LIMIT 1",
            (work,),
        ).fetchone()
        alive = conn.execute("SELECT deleted_at IS NULL FROM calendar WHERE id = %s", (work,)).fetchone()
    assert audit == ("restore", trash.ids["ada"]) and alive == (True,)


def test_restore_validates_the_request(trash: Trash) -> None:
    ada = trash.sign_in("ada")
    assert trash.api.post("/api/v1/trash/restore", json={"entries": []}, headers=ada).status_code == 422
    assert (
        trash.api.post(
            "/api/v1/trash/restore",
            json={"entries": [{"type": "user", "id": str(uuid.uuid7())}]},
            headers=ada,
        ).status_code
        == 422
    )
    trash.api.cookies.clear()
    assert trash.api.get("/api/v1/trash").status_code == 401
