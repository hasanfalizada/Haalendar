"""Bulk operations (FR-X-07, D-41): one delete batch for many rows and its restore, per-target values, new versions in
the answer, all-or-nothing with the offending targets named, owner-only containers, row-level security, refusals,
audit (marker `db`).

+++===+++ 2026-10-16 — Hasan Alizada — HAAL-036.
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


class World:
    def __init__(self, api: TestClient, db_url: str) -> None:
        self.api, self.db_url = api, db_url
        for name in ("ada", "bob"):
            create_user(api, db_url, f"{name}@example.org")
        self.ids = {
            str(e).split("@")[0]: str(i) for e, i in sql(db_url, "SELECT email, id FROM user_account")
        }
        self.cal: dict[str, str] = {}
        with _as(db_url, self.ids["ada"]) as conn:
            for name, default in (("Work", False), ("Home", False), ("Main", True)):
                self.cal[name] = str(uuid.uuid7())
                conn.execute(
                    "INSERT INTO calendar (id, owner_id, name, is_default) VALUES (%s, %s, %s, %s)",
                    (self.cal[name], self.ids["ada"], name, default),
                )
            conn.execute(
                "INSERT INTO share (id, container_kind, container_id, grantee_id, permission, granted_by) "
                "VALUES (%s, 'calendar', %s, %s, 'edit', %s)",
                (uuid.uuid7(), self.cal["Work"], self.ids["bob"], self.ids["ada"]),
            )

    def sign_in(self, name: str) -> dict[str, str]:
        status, body = login(self.api, f"{name}@example.org")
        assert status == 200
        return {"X-CSRF-Token": str(body["csrf_token"])}

    def row(self, name: str) -> tuple[Any, ...]:
        with _as(self.db_url, self.ids["ada"]) as conn:
            found = conn.execute(
                "SELECT version, color, deleted_at IS NOT NULL, delete_batch_id FROM calendar WHERE id = %s",
                (self.cal[name],),
            ).fetchone()
        assert found is not None
        return tuple(found)

    def target(self, name: str, **extra: Any) -> dict[str, Any]:
        return {"type": "calendar", "id": self.cal[name], "version": self.row(name)[0], **extra}

    def bulk(self, headers: dict[str, str], body: dict[str, Any]) -> Any:
        return self.api.post("/api/v1/bulk", json=body, headers=headers)


@pytest.fixture
def world(api: TestClient, clean_db: str) -> World:
    return World(api, clean_db)


def test_delete_is_one_batch_and_restore_brings_it_back(world: World) -> None:
    ada = world.sign_in("ada")
    response = world.bulk(ada, {"action": "delete", "targets": [world.target("Work"), world.target("Home")]})
    assert response.status_code == 200, response.text
    result = response.json()
    assert result["applied"] == 2 and result["delete_batch_id"]
    assert sorted(i["version"] for i in result["items"]) == [2, 2]
    work, home = world.row("Work"), world.row("Home")
    assert work[2] and home[2] and work[3] == home[3] == uuid.UUID(result["delete_batch_id"])

    restore = world.bulk(
        ada,
        {
            "action": "restore",
            "targets": [
                {"type": "calendar", "id": i["id"], "version": i["version"]} for i in result["items"]
            ],
        },
    )
    assert restore.status_code == 200, restore.text
    assert restore.json()["delete_batch_id"] is None
    assert sorted(i["version"] for i in restore.json()["items"]) == [3, 3]
    assert not world.row("Work")[2] and not world.row("Home")[2]

    with _as(world.db_url, world.ids["ada"]) as conn:
        actions = [
            r[0]
            for r in conn.execute(
                "SELECT action FROM audit_log WHERE entity_id = %s ORDER BY id", (world.cal["Work"],)
            ).fetchall()
        ]
    assert actions[-2:] == ["delete", "restore"]


def test_set_color_uses_per_target_values_over_the_common_one(world: World) -> None:
    ada = world.sign_in("ada")
    response = world.bulk(
        ada,
        {
            "action": "set_color",
            "color": "green",
            "targets": [world.target("Work", color="red"), world.target("Home"), world.target("Home")],
        },
    )
    assert response.status_code == 200, response.text
    assert response.json()["applied"] == 2  # a duplicate target changes once
    assert world.row("Work")[1] == "red" and world.row("Home")[1] == "green"
    assert world.row("Home")[0] == 2


def test_one_refusal_changes_nothing_and_names_the_targets(world: World) -> None:
    ada = world.sign_in("ada")
    stale = world.target("Home") | {"version": 99}
    response = world.bulk(
        ada, {"action": "set_color", "color": "purple", "targets": [world.target("Work"), stale]}
    )
    assert response.status_code == 412
    problem = response.json()
    assert problem["code"] == "version_conflict"
    assert problem["errors"] == [
        {"pointer": "/targets/1", "code": "version_conflict", "detail": "Changed elsewhere in the meantime"}
    ]
    assert world.row("Work")[1] == "blue" and world.row("Work")[0] == 1

    mixed = world.bulk(
        ada,
        {"action": "delete", "targets": [world.target("Main"), world.target("Work"), stale]},
    )
    assert mixed.status_code == 422
    assert [(e["pointer"], e["code"]) for e in mixed.json()["errors"]] == [
        ("/targets/0", "invalid_state"),  # the default calendar stays
        ("/targets/2", "version_conflict"),
    ]
    assert not world.row("Work")[2]


def test_containers_belong_to_their_owner_and_others_are_invisible(world: World) -> None:
    bob = world.sign_in("bob")  # edit share on Work: contents, not the container's settings
    response = world.bulk(
        bob,
        {"action": "set_color", "color": "red", "targets": [world.target("Work"), world.target("Home")]},
    )
    assert response.status_code == 422
    assert [(e["pointer"], e["code"]) for e in response.json()["errors"]] == [
        ("/targets/0", "forbidden"),
        ("/targets/1", "not_found"),
    ]


def test_unsupported_actions_kinds_and_missing_values(world: World) -> None:
    ada = world.sign_in("ada")
    priority = world.bulk(
        ada, {"action": "set_priority", "priority": "high", "targets": [world.target("Work")]}
    )
    assert priority.status_code == 422 and priority.json()["errors"][0]["code"] == "unsupported"
    event = world.bulk(
        ada, {"action": "delete", "targets": [{"type": "event", "id": str(uuid.uuid7()), "version": 1}]}
    )
    assert event.status_code == 422 and event.json()["errors"][0]["code"] == "unsupported"
    missing = world.bulk(ada, {"action": "set_color", "targets": [world.target("Work")]})
    assert missing.status_code == 422 and missing.json()["errors"][0]["pointer"] == "/targets/0/color"
    gone = world.bulk(
        ada, {"action": "restore", "targets": [world.target("Work")]}
    )  # not deleted → nothing to restore
    assert gone.status_code == 422 and gone.json()["errors"][0]["code"] == "not_found"


def test_request_limits(world: World) -> None:
    ada = world.sign_in("ada")
    assert world.bulk(ada, {"action": "delete", "targets": []}).status_code == 422
    many = [{"type": "calendar", "id": str(uuid.uuid7()), "version": 1} for _ in range(501)]
    assert world.bulk(ada, {"action": "delete", "targets": many}).status_code == 422
    assert world.bulk(ada, {"action": "purge", "targets": [world.target("Work")]}).status_code == 422
    world.api.cookies.clear()
    assert world.bulk({}, {"action": "delete", "targets": [world.target("Work")]}).status_code in (401, 403)
