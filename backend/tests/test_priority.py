"""Priority (FR-X-12, D-46): the database default and check, SQL sort and filter with the atom's order, bulk priority and
color for events, notes and cards with access through the container (marker `db`).

+++===+++ 2026-10-17 — Hasan Alizada — HAAL-041.
"""

from __future__ import annotations

import uuid
from typing import Any

import psycopg
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import Select, select
from sqlalchemy.dialects.postgresql.base import PGDialect
from sqlalchemy.engine import make_url

from haalendar.atoms.items.priority import filter_sql, rank_sql
from haalendar.planning.models import Item

from .account_helpers import create_user, login, sql

pytestmark = pytest.mark.db


def _dsn(url: str) -> str:
    return make_url(url).set(drivername="postgresql").render_as_string(hide_password=False)


def _as(db_url: str, user_id: str) -> psycopg.Connection:
    conn = psycopg.connect(_dsn(db_url), autocommit=True)
    conn.execute("SELECT set_config('app.user_id', %s, false)", (user_id,))
    return conn


class World:
    def __init__(self, api: TestClient, db_url: str) -> None:
        self.api, self.db_url = api, db_url
        for name in ("ada", "bob", "cid", "dee"):
            create_user(api, db_url, f"{name}@example.org")
        self.ids = {
            str(e).split("@")[0]: str(i) for e, i in sql(db_url, "SELECT email, id FROM user_account")
        }
        self.calendar = str(uuid.uuid7())
        self.items: dict[str, str] = {}
        with _as(db_url, self.ids["ada"]) as conn:
            conn.execute(
                "INSERT INTO calendar (id, owner_id, name) VALUES (%s, %s, 'Work')",
                (self.calendar, self.ids["ada"]),
            )
            for title, priority in (
                ("Low one", "low"),
                ("Urgent", "high"),
                ("Plain", None),
                ("Also urgent", "high"),
            ):
                self.items[title] = str(uuid.uuid7())
                columns = "id, kind, owner_id, container_kind, container_id, title" + (
                    ", priority" if priority else ""
                )
                values = [self.items[title], "event", self.ids["ada"], "calendar", self.calendar, title]
                if priority:
                    values.append(priority)
                conn.execute(
                    f"INSERT INTO item ({columns}) VALUES ({', '.join(['%s'] * len(values))})",  # noqa: S608 — test SQL, constant columns
                    values,
                )
            for grantee, permission in (("bob", "view"), ("dee", "edit")):
                conn.execute(
                    "INSERT INTO share (id, container_kind, container_id, grantee_id, permission, granted_by) "
                    "VALUES (%s, 'calendar', %s, %s, %s, %s)",
                    (uuid.uuid7(), self.calendar, self.ids[grantee], permission, self.ids["ada"]),
                )

    def rows(self, statement: Select[Any]) -> list[str]:
        dialect = PGDialect()  # type: ignore[no-untyped-call]  # SQLAlchemy's dialect constructors are not annotated
        text = str(statement.compile(dialect=dialect, compile_kwargs={"literal_binds": True}))
        with _as(self.db_url, self.ids["ada"]) as conn:
            return [str(r[0]) for r in conn.execute(text).fetchall()]

    def sign_in(self, name: str) -> dict[str, str]:
        self.api.cookies.clear()
        status, body = login(self.api, f"{name}@example.org")
        assert status == 200
        return {"X-CSRF-Token": str(body["csrf_token"])}

    def target(self, title: str, **extra: Any) -> dict[str, Any]:
        version = self.rows(select(Item.version).where(Item.id == uuid.UUID(self.items[title])))[0]
        return {"type": "event", "id": self.items[title], "version": int(version), **extra}

    def priority(self, title: str) -> tuple[str, str]:
        rows = self.rows(select(Item.priority).where(Item.id == uuid.UUID(self.items[title])))
        colors = self.rows(select(Item.color).where(Item.id == uuid.UUID(self.items[title])))
        return rows[0], colors[0]


@pytest.fixture
def world(api: TestClient, clean_db: str) -> World:
    return World(api, clean_db)


def test_default_is_medium_and_only_three_values_exist(world: World) -> None:
    assert world.priority("Plain") == ("medium", "brown")
    with pytest.raises(psycopg.errors.CheckViolation), _as(world.db_url, world.ids["ada"]) as conn:
        conn.execute("UPDATE item SET priority = 'urgent' WHERE id = %s", (world.items["Plain"],))


def test_sql_sort_and_filter_follow_the_atom(world: World) -> None:
    by_priority = select(Item.title).order_by(rank_sql(Item.priority).desc(), Item.title)
    assert world.rows(by_priority) == ["Also urgent", "Urgent", "Plain", "Low one"]
    high = filter_sql(Item.priority, ["high"])
    assert high is not None
    assert world.rows(select(Item.title).where(high).order_by(Item.title)) == ["Also urgent", "Urgent"]
    medium_low = filter_sql(Item.priority, ["medium", "low"])
    assert medium_low is not None
    assert world.rows(select(Item.title).where(medium_low).order_by(Item.title)) == ["Low one", "Plain"]
    assert filter_sql(Item.priority, []) is None


def test_bulk_priority_and_color_for_events(world: World) -> None:
    ada = world.sign_in("ada")
    response = world.api.post(
        "/api/v1/bulk",
        json={
            "action": "set_priority",
            "priority": "low",
            "targets": [world.target("Urgent"), world.target("Plain", priority="high")],
        },
        headers=ada,
    )
    assert response.status_code == 200, response.text
    assert world.priority("Urgent")[0] == "low" and world.priority("Plain")[0] == "high"
    color = world.api.post(
        "/api/v1/bulk",
        json={"action": "set_color", "color": "red", "targets": [world.target("Plain")]},
        headers=ada,
    )
    assert color.status_code == 200 and world.priority("Plain")[1] == "red"
    delete = world.api.post(
        "/api/v1/bulk", json={"action": "delete", "targets": [world.target("Plain")]}, headers=ada
    )
    assert delete.status_code == 422 and delete.json()["errors"][0]["code"] == "unsupported"
    wrong_kind = world.api.post(
        "/api/v1/bulk",
        json={
            "action": "set_priority",
            "priority": "low",
            "targets": [{**world.target("Plain"), "type": "note"}],
        },
        headers=ada,
    )
    assert wrong_kind.status_code == 422 and wrong_kind.json()["errors"][0]["code"] == "not_found"


def test_bulk_priority_follows_container_access(world: World) -> None:
    body = {"action": "set_priority", "priority": "high", "targets": [world.target("Low one")]}
    bob = world.sign_in("bob")  # view share
    refused = world.api.post("/api/v1/bulk", json=body, headers=bob)
    assert refused.status_code == 422 and refused.json()["errors"][0]["code"] == "forbidden"
    cid = world.sign_in("cid")  # nothing shared
    hidden = world.api.post("/api/v1/bulk", json=body, headers=cid)
    assert hidden.status_code == 422 and hidden.json()["errors"][0]["code"] == "not_found"
    dee = world.sign_in("dee")  # edit share
    assert world.api.post("/api/v1/bulk", json=body, headers=dee).status_code == 200
    assert world.priority("Low one")[0] == "high"
