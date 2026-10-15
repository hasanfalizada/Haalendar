"""Per-user data isolation (FR-ACC-07, ADR-0005): least-privilege application role, row-level security on every
owner/share table, the full owner / edit / view / stranger / admin matrix, the request context and authz.require
(marker `db`).

+++===+++ 2026-10-15 — Hasan Alizada — HAAL-165. Everything runs as the application role, exactly like production.
New protected tables are picked up automatically: a table with owner_id / container_id / grantee_id that is not in
PROTECTED_TABLES or has no row-level security fails test_every_owner_table_is_protected.
"""

from __future__ import annotations

import asyncio
import uuid
from collections.abc import Iterator
from contextlib import contextmanager

import psycopg
import pytest
from fastapi.testclient import TestClient
from psycopg import errors
from sqlalchemy import func, select
from sqlalchemy.engine import make_url
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from haalendar.authz import require
from haalendar.deps import Auth, DbSession
from haalendar.errors import ProblemError
from haalendar.main import create_app
from haalendar.security.rls import PROTECTED_TABLES

from .account_helpers import create_user, login
from .conftest import make_settings

pytestmark = pytest.mark.db


def _dsn(url: str) -> str:
    return make_url(url).set(drivername="postgresql").render_as_string(hide_password=False)


@contextmanager
def as_user(db_url: str, user_id: uuid.UUID | None) -> Iterator[psycopg.Connection]:
    """Application-role connection acting as `user_id` (None = no user context)."""
    with psycopg.connect(_dsn(db_url), autocommit=True) as conn:
        if user_id is not None:
            conn.execute("SELECT set_config('app.user_id', %s, false)", (str(user_id),))
        yield conn


class World:
    """Ada owns a calendar; Bob has an edit share, Cid a view share, Dee nothing; Root is an admin without a share."""

    def __init__(self, owner_db_url: str, db_url: str) -> None:
        self.db_url = db_url
        self.ada, self.bob, self.cid, self.dee, self.root = (uuid.uuid7() for _ in range(5))
        with psycopg.connect(_dsn(owner_db_url), autocommit=True) as conn:
            for user_id, name, role in (
                (self.ada, "ada", "user"),
                (self.bob, "bob", "user"),
                (self.cid, "cid", "user"),
                (self.dee, "dee", "user"),
                (self.root, "root", "admin"),
            ):
                conn.execute(
                    "INSERT INTO user_account (id, email, password_hash, display_name, time_zone, role) "
                    "VALUES (%s, %s, 'x', %s, 'UTC', %s)",
                    (user_id, f"{name}@example.org", name, role),
                )
        self.calendar = uuid.uuid7()
        with as_user(db_url, self.ada) as conn:
            conn.execute(
                "INSERT INTO calendar (id, owner_id, name, created_by) VALUES (%s, %s, 'Ada', %s)",
                (self.calendar, self.ada, self.ada),
            )
            for grantee, permission in ((self.bob, "edit"), (self.cid, "view")):
                conn.execute(
                    "INSERT INTO share (id, container_kind, container_id, grantee_id, permission, granted_by) "
                    "VALUES (%s, 'calendar', %s, %s, %s, %s)",
                    (uuid.uuid7(), self.calendar, grantee, permission, self.ada),
                )

    def visible_calendars(self, user_id: uuid.UUID | None) -> int:
        with as_user(self.db_url, user_id) as conn:
            row = conn.execute("SELECT count(*) FROM calendar").fetchone()
            return int(row[0]) if row else 0

    def rename(self, user_id: uuid.UUID) -> int:
        with as_user(self.db_url, user_id) as conn:
            return conn.execute(
                "UPDATE calendar SET name = 'renamed', version = version + 1 WHERE id = %s", (self.calendar,)
            ).rowcount


@pytest.fixture
def world(clean_db: str, owner_db_url: str) -> World:
    return World(owner_db_url, clean_db)


# ---------- database role ----------


def test_application_role_is_least_privilege(db_url: str) -> None:
    with as_user(db_url, None) as conn:
        flags = conn.execute(
            "SELECT rolsuper, rolbypassrls, rolcreaterole, rolcreatedb FROM pg_roles WHERE rolname = current_user"
        ).fetchone()
        assert flags == (False, False, False, False)
        rights = conn.execute(
            "SELECT tablename, has_table_privilege(current_user, 'public.' || tablename, 'DELETE'), "
            "has_table_privilege(current_user, 'public.' || tablename, 'TRUNCATE'), "
            "has_table_privilege(current_user, 'public.' || tablename, 'UPDATE') "
            "FROM pg_tables WHERE schemaname = 'public'"
        ).fetchall()
    assert rights, "no tables visible"
    for table, can_delete, can_truncate, can_update in rights:
        assert not can_delete and not can_truncate, table
        assert can_update == (table != "alembic_version"), table


def test_physical_delete_is_impossible(clean_db: str) -> None:
    with as_user(clean_db, None) as conn, pytest.raises(errors.InsufficientPrivilege):
        conn.execute("DELETE FROM user_account")


def test_every_owner_table_is_protected(owner_db_url: str) -> None:
    with psycopg.connect(_dsn(owner_db_url), autocommit=True) as conn:
        tables = {
            row[0]
            for row in conn.execute(
                "SELECT DISTINCT table_name FROM information_schema.columns WHERE table_schema = 'public' "
                "AND column_name IN ('owner_id', 'container_id', 'grantee_id')"
            ).fetchall()
        }
        protected = {
            row[0]
            for row in conn.execute(
                "SELECT relname FROM pg_class JOIN pg_namespace n ON n.oid = relnamespace "
                "WHERE nspname = 'public' AND relkind = 'r' AND relrowsecurity"
            ).fetchall()
        }
    assert tables, "expected planning tables"
    assert tables <= set(PROTECTED_TABLES), tables - set(PROTECTED_TABLES)
    assert set(PROTECTED_TABLES) <= protected


def test_production_refuses_a_role_that_bypasses_rls(owner_db_url: str) -> None:
    settings = make_settings(
        env="production", secret_key="k" * 40, public_url="https://testserver", database_url=owner_db_url
    )
    with pytest.raises(RuntimeError, match="BYPASSRLS"), TestClient(create_app(settings)):
        pass


def test_readiness_reports_rls_enforced(api: TestClient) -> None:
    body = api.get("/api/v1/health/ready").json()
    assert body["status"] == "ready" and body["checks"]["rls_enforced"] is True


# ---------- containers ----------


def test_calendar_visibility_matrix(world: World) -> None:
    assert world.visible_calendars(world.ada) == 1
    assert world.visible_calendars(world.bob) == 1  # edit share
    assert world.visible_calendars(world.cid) == 1  # view share
    assert world.visible_calendars(world.dee) == 0  # stranger
    assert world.visible_calendars(world.root) == 0  # administrators have no content access
    assert world.visible_calendars(None) == 0  # no user context


def test_only_the_owner_manages_the_container(world: World) -> None:
    assert world.rename(world.dee) == 0
    assert world.rename(world.cid) == 0
    assert world.rename(world.bob) == 0  # editing items is not managing the container
    assert world.rename(world.root) == 0
    assert world.rename(world.ada) == 1
    with as_user(world.db_url, world.dee) as conn:
        soft_deleted = conn.execute(
            "UPDATE calendar SET deleted_at = now() WHERE id = %s", (world.calendar,)
        ).rowcount
    assert soft_deleted == 0


def test_nobody_creates_or_moves_rows_into_another_users_name(world: World) -> None:
    with as_user(world.db_url, world.dee) as conn, pytest.raises(errors.InsufficientPrivilege):
        conn.execute(
            "INSERT INTO calendar (id, owner_id, name) VALUES (%s, %s, 'planted')", (uuid.uuid7(), world.ada)
        )
    with as_user(world.db_url, world.ada) as conn, pytest.raises(errors.InsufficientPrivilege):
        conn.execute("UPDATE calendar SET owner_id = %s WHERE id = %s", (world.dee, world.calendar))


# ---------- shares ----------


def test_share_visibility_and_owner_only_granting(world: World) -> None:
    def visible_shares(user_id: uuid.UUID) -> int:
        with as_user(world.db_url, user_id) as conn:
            row = conn.execute("SELECT count(*) FROM share").fetchone()
            return int(row[0]) if row else 0

    assert visible_shares(world.ada) == 2
    assert visible_shares(world.bob) == 1
    assert visible_shares(world.dee) == 0

    def grant(actor: uuid.UUID, grantee: uuid.UUID) -> None:
        with as_user(world.db_url, actor) as conn:
            conn.execute(
                "INSERT INTO share (id, container_kind, container_id, grantee_id, permission, granted_by) "
                "VALUES (%s, 'calendar', %s, %s, 'edit', %s)",
                (uuid.uuid7(), world.calendar, grantee, actor),
            )

    for actor, grantee in ((world.dee, world.dee), (world.bob, world.dee), (world.ada, world.ada)):
        with pytest.raises(errors.InsufficientPrivilege):
            grant(actor, grantee)


def test_revoked_share_removes_access(world: World) -> None:
    with as_user(world.db_url, world.ada) as conn:
        revoked = conn.execute(
            "UPDATE share SET revoked_at = now() WHERE grantee_id = %s AND revoked_at IS NULL", (world.bob,)
        ).rowcount
    assert revoked == 1
    assert world.visible_calendars(world.bob) == 0
    with as_user(world.db_url, world.bob) as conn:
        assert (
            conn.execute("UPDATE share SET revoked_at = NULL WHERE grantee_id = %s", (world.bob,)).rowcount
            == 0
        )


# ---------- authz.require in a request-like transaction ----------


def test_require_maps_decisions_to_404_and_403(world: World) -> None:
    async def run(user_id: uuid.UUID, action: str) -> int:
        engine = create_async_engine(world.db_url)
        try:
            async with async_sessionmaker(engine)() as db, db.begin():
                await db.execute(select(func.set_config("app.user_id", str(user_id), True)))
                try:
                    await require(db, user_id, action, "calendar", world.calendar)  # type: ignore[arg-type]
                except ProblemError as error:
                    return error.status
                return 200
        finally:
            await engine.dispose()

    assert asyncio.run(run(world.ada, "share")) == 200
    assert asyncio.run(run(world.bob, "write_items")) == 200
    assert asyncio.run(run(world.bob, "manage_container")) == 403
    assert asyncio.run(run(world.cid, "write_items")) == 403
    assert asyncio.run(run(world.dee, "read")) == 404
    assert asyncio.run(run(world.root, "read")) == 404


# ---------- request context ----------


def test_request_transaction_carries_the_signed_in_user(clean_db: str) -> None:
    app = create_app(make_settings(database_url=clean_db))

    @app.get("/api/v1/test/rls-context")
    async def signed_in(auth: Auth, db: DbSession) -> dict[str, str | None]:
        current = await db.scalar(select(func.haalendar_current_user_id()))
        return {"user": str(auth.user.id), "context": str(current) if current else None}

    @app.get("/api/v1/test/rls-anonymous")
    async def anonymous(db: DbSession) -> dict[str, str | None]:
        current = await db.scalar(select(func.haalendar_current_user_id()))
        return {"context": str(current) if current else None}

    with TestClient(app, base_url="https://testserver", raise_server_exceptions=False) as api:
        create_user(api, clean_db, "eve@example.org")
        assert login(api, "eve@example.org")[0] == 200
        seen = api.get("/api/v1/test/rls-context").json()
        assert seen["context"] == seen["user"]
        for _ in range(3):  # pooled connections must not keep the previous request's user
            assert api.get("/api/v1/test/rls-anonymous").json() == {"context": None}
