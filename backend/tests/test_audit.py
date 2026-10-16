"""Audit log (FR-X-03): every table is audited or explicitly exempt; actions and diff snapshots are derived by the
database; the application can neither write nor change audit records; who may read which history; the history
service and the request id link (marker `db`).

+++===+++ 2026-10-16 — Hasan Alizada — HAAL-032.
"""

from __future__ import annotations

import asyncio
import uuid
from collections.abc import Iterator
from contextlib import contextmanager
from typing import Any

import psycopg
import pytest
from fastapi.testclient import TestClient
from psycopg import errors
from psycopg.types.json import Jsonb
from sqlalchemy import func, select
from sqlalchemy.engine import make_url
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from haalendar.audit.service import history
from haalendar.audit.sql import AUDIT_EXEMPT_TABLES, AUDITED_TABLES

from .account_helpers import create_user, login, sql

pytestmark = pytest.mark.db


def _dsn(url: str) -> str:
    return make_url(url).set(drivername="postgresql").render_as_string(hide_password=False)


@contextmanager
def as_user(
    db_url: str, user_id: uuid.UUID | None, request_id: str | None = None
) -> Iterator[psycopg.Connection]:
    with psycopg.connect(_dsn(db_url), autocommit=True) as conn:
        if user_id is not None:
            conn.execute("SELECT set_config('app.user_id', %s, false)", (str(user_id),))
        if request_id is not None:
            conn.execute("SELECT set_config('app.request_id', %s, false)", (request_id,))
        yield conn


def _records(owner_db_url: str, entity_id: uuid.UUID) -> list[tuple[Any, ...]]:
    with psycopg.connect(_dsn(owner_db_url), autocommit=True) as conn:
        return conn.execute(
            "SELECT action, actor_id, before, after, request_id, container_kind, container_id "
            "FROM audit_log WHERE entity_id = %s ORDER BY id",
            (entity_id,),
        ).fetchall()


def _user(owner_db_url: str, name: str, role: str = "user") -> uuid.UUID:
    user_id = uuid.uuid7()
    with psycopg.connect(_dsn(owner_db_url), autocommit=True) as conn:
        conn.execute(
            "INSERT INTO user_account (id, email, password_hash, display_name, time_zone, role) "
            "VALUES (%s, %s, 'secret-hash', %s, 'UTC', %s)",
            (user_id, f"{name}@example.org", name.title(), role),
        )
    return user_id


def test_every_table_is_audited_or_exempt(owner_db_url: str) -> None:
    with psycopg.connect(_dsn(owner_db_url), autocommit=True) as conn:
        tables = {r[0] for r in conn.execute("SELECT tablename FROM pg_tables WHERE schemaname = 'public'")}
        triggered = {
            r[0]
            for r in conn.execute(
                "SELECT c.relname FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid "
                "WHERE t.tgname = 'haalendar_audit' AND NOT t.tgisinternal"
            )
        }
    undecided = tables - set(AUDITED_TABLES) - AUDIT_EXEMPT_TABLES
    assert undecided == set(), f"decide: audit or exempt {undecided}"
    assert set(AUDITED_TABLES) <= triggered, set(AUDITED_TABLES) - triggered


def test_calendar_lifecycle_is_recorded_with_diffs(clean_db: str, owner_db_url: str) -> None:
    ada = _user(owner_db_url, "ada")
    calendar = uuid.uuid7()
    with as_user(clean_db, ada, "req-create") as conn:
        conn.execute("INSERT INTO calendar (id, owner_id, name) VALUES (%s, %s, 'Home')", (calendar, ada))
    with as_user(clean_db, ada, "req-edit") as conn:
        conn.execute("UPDATE calendar SET name = 'Family', version = version + 1 WHERE id = %s", (calendar,))
        conn.execute("UPDATE calendar SET version = version + 1 WHERE id = %s", (calendar,))  # technical only
        conn.execute(
            "UPDATE calendar SET deleted_at = now(), delete_batch_id = %s, updated_by = %s WHERE id = %s",
            (uuid.uuid7(), ada, calendar),
        )
        conn.execute(
            "UPDATE calendar SET deleted_at = NULL, delete_batch_id = NULL WHERE id = %s", (calendar,)
        )

    records = _records(owner_db_url, calendar)
    assert [r[0] for r in records] == ["create", "update", "delete", "restore"]
    create, update, delete, restore = records
    assert create[1] == ada and create[3]["name"] == "Home" and create[2] is None
    assert create[4] == "req-create" and (create[5], create[6]) == ("calendar", calendar)
    assert update[2] == {"name": "Home"} and update[3] == {"name": "Family"} and update[4] == "req-edit"
    assert set(delete[3]) == {"deleted_at", "delete_batch_id"}  # updated_by / version are technical
    assert restore[3] == {"deleted_at": None, "delete_batch_id": None}


def test_share_actions(clean_db: str, owner_db_url: str) -> None:
    ada, bob = _user(owner_db_url, "ada"), _user(owner_db_url, "bob")
    calendar, share = uuid.uuid7(), uuid.uuid7()
    with as_user(clean_db, ada) as conn:
        conn.execute("INSERT INTO calendar (id, owner_id, name) VALUES (%s, %s, 'Team')", (calendar, ada))
        conn.execute(
            "INSERT INTO share (id, container_kind, container_id, grantee_id, permission, granted_by) "
            "VALUES (%s, 'calendar', %s, %s, 'view', %s)",
            (share, calendar, bob, ada),
        )
        conn.execute("UPDATE share SET permission = 'edit' WHERE id = %s", (share,))
        conn.execute("UPDATE share SET revoked_at = now() WHERE id = %s", (share,))
    records = _records(owner_db_url, share)
    assert [r[0] for r in records] == ["share", "update", "unshare"]
    assert records[1][2:4] == ({"permission": "view"}, {"permission": "edit"})
    assert (records[0][5], records[0][6]) == ("calendar", calendar)


def test_account_changes_leave_out_secrets_and_logins(clean_db: str, owner_db_url: str) -> None:
    root, joe = _user(owner_db_url, "root", "admin"), _user(owner_db_url, "joe")
    created = _records(owner_db_url, joe)
    assert [r[0] for r in created] == ["create"]
    assert "password_hash" not in created[0][3] and created[0][3]["email"] == "joe@example.org"
    with as_user(clean_db, root) as conn:
        conn.execute(
            "UPDATE user_account SET failed_login_count = 3, last_login_at = now(), password_hash = 'x2' "
            "WHERE id = %s",
            (joe,),
        )  # login bookkeeping and secrets: no record
        conn.execute("UPDATE user_account SET role = 'admin' WHERE id = %s", (joe,))
    records = _records(owner_db_url, joe)
    assert [r[0] for r in records] == ["create", "update"]
    assert records[1][1] == root and records[1][2:4] == ({"role": "user"}, {"role": "admin"})


def test_audit_records_cannot_be_forged_changed_or_removed(clean_db: str, owner_db_url: str) -> None:
    ada = _user(owner_db_url, "ada")
    with as_user(clean_db, ada) as conn, pytest.raises(errors.InsufficientPrivilege):
        conn.execute(
            "INSERT INTO audit_log (action, entity_type, entity_id, after) VALUES ('create', 'calendar', %s, %s)",
            (uuid.uuid7(), Jsonb({})),
        )
    with as_user(clean_db, ada) as conn, pytest.raises(errors.InsufficientPrivilege):
        conn.execute("UPDATE audit_log SET action = 'update'")
    with psycopg.connect(_dsn(owner_db_url), autocommit=True) as conn:
        with pytest.raises(errors.RestrictViolation, match="append-only"):
            conn.execute("UPDATE audit_log SET action = 'update'")
        with pytest.raises(errors.RestrictViolation):
            conn.execute("DELETE FROM audit_log WHERE false")


def test_who_reads_which_history(clean_db: str, owner_db_url: str) -> None:
    ada, bob, cid = _user(owner_db_url, "ada"), _user(owner_db_url, "bob"), _user(owner_db_url, "cid")
    root = _user(owner_db_url, "root", "admin")
    calendar, share = uuid.uuid7(), uuid.uuid7()
    with as_user(clean_db, ada) as conn:
        conn.execute("INSERT INTO calendar (id, owner_id, name) VALUES (%s, %s, 'Shared')", (calendar, ada))
        conn.execute(
            "INSERT INTO share (id, container_kind, container_id, grantee_id, permission, granted_by) "
            "VALUES (%s, 'calendar', %s, %s, 'view', %s)",
            (share, calendar, bob, ada),
        )

    def visible(user: uuid.UUID, entity: uuid.UUID) -> int:
        with as_user(clean_db, user) as conn:
            row = conn.execute("SELECT count(*) FROM audit_log WHERE entity_id = %s", (entity,)).fetchone()
            return int(row[0]) if row else 0

    assert (
        visible(ada, calendar) == 1 and visible(bob, calendar) == 1
    )  # owner and grantee see content history
    assert visible(cid, calendar) == 0 and visible(root, calendar) == 0  # strangers and admins do not
    assert visible(ada, share) == 1 and visible(bob, share) == 0  # sharing history: owner only
    assert (
        visible(cid, cid) == 1 and visible(bob, cid) == 0 and visible(root, cid) == 1
    )  # accounts: self, admins


def test_history_service_names_actors_and_paginates(clean_db: str, owner_db_url: str) -> None:
    ada = _user(owner_db_url, "ada")
    calendar = uuid.uuid7()
    with as_user(clean_db, ada) as conn:
        conn.execute("INSERT INTO calendar (id, owner_id, name) VALUES (%s, %s, 'v0')", (calendar, ada))
        for i in range(1, 4):
            conn.execute("UPDATE calendar SET name = %s WHERE id = %s", (f"v{i}", calendar))

    async def run() -> tuple[list[str], list[str], str | None, str | None]:
        engine = create_async_engine(clean_db)
        try:
            async with async_sessionmaker(engine)() as db, db.begin():
                await db.execute(select(func.set_config("app.user_id", str(ada), True)))
                first = await history(db, "calendar", calendar, limit=3)
                second = await history(db, "calendar", calendar, cursor=first.next_cursor, limit=3)
                names = {r.actor_name for r in first.records}
                assert names == {"Ada"}
                return (
                    [r.action for r in first.records],
                    [r.action for r in second.records],
                    first.next_cursor,
                    second.next_cursor,
                )
        finally:
            await engine.dispose()

    first, second, cursor, end = asyncio.run(run())
    assert first == ["update", "update", "update"] and second == ["create"]  # newest first
    assert cursor is not None and end is None


def test_api_mutations_carry_the_request_id(api: TestClient, clean_db: str) -> None:
    create_user(api, clean_db, "pam@example.org")
    _, body = login(api, "pam@example.org")
    response = api.patch(
        "/api/v1/me",
        json={"display_name": "Pam Audited"},
        headers={
            "X-CSRF-Token": str(body["csrf_token"]),
            "If-Match": '"1"',
            "Content-Type": "application/merge-patch+json",
        },
    )
    assert response.status_code == 200
    pam = uuid.UUID(str(sql(clean_db, "SELECT id FROM user_account WHERE email = 'pam@example.org'")[0][0]))
    with as_user(clean_db, pam) as conn:  # own account history is readable
        row = conn.execute(
            "SELECT actor_id, request_id, after FROM audit_log WHERE entity_id = %s AND action = 'update'",
            (pam,),
        ).fetchone()
    assert row is not None
    assert (
        row[0] == pam
        and row[1] == response.headers["X-Request-ID"]
        and row[2] == {"display_name": "Pam Audited"}
    )
