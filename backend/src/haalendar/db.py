"""Database engine, sessions and readiness checks (PostgreSQL 18 via psycopg 3, SQLAlchemy 2.1 async).

+++===+++ 2026-10-14 — Hasan Alizada — HAAL-016. One async engine per process with a bounded pool (backend
performance checklist: connection pooling, timeouts). Readiness = database reachable and migrations at head.
+++===+++ 2026-10-15 — Hasan Alizada — HAAL-165. The application role must not bypass row-level security (superuser or
BYPASSRLS): production refuses to start / reports not ready in that case; other environments log a warning.
"""

from __future__ import annotations

import time
from collections.abc import AsyncIterator
from dataclasses import dataclass
from pathlib import Path

from alembic.config import Config
from alembic.script import ScriptDirectory
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession, async_sessionmaker, create_async_engine

from haalendar.config import Settings
from haalendar.logging import get_logger

log = get_logger(__name__)

BACKEND_ROOT = Path(__file__).resolve().parents[2]
ALEMBIC_INI = BACKEND_ROOT / "alembic.ini"


def create_engine(settings: Settings) -> AsyncEngine:
    """Create the async engine; the URL is never logged (it contains the password)."""
    engine = create_async_engine(
        settings.database_url.get_secret_value(),
        pool_size=settings.db_pool_size,
        max_overflow=settings.db_max_overflow,
        pool_timeout=settings.db_pool_timeout_seconds,
        pool_pre_ping=True,
        # +++===+++ 2026-10-15 — Hasan Alizada — HAAL-169. Sessions always run in UTC, so timestamptz values reach the
        # API as UTC instants (contract Timestamp: RFC 3339, UTC) whatever the server's default time zone is.
        connect_args={"connect_timeout": settings.db_connect_timeout_seconds, "options": "-c timezone=UTC"},
    )
    log.info(
        "db_engine_created",
        pool_size=settings.db_pool_size,
        max_overflow=settings.db_max_overflow,
        pool_timeout_seconds=settings.db_pool_timeout_seconds,
    )
    return engine


def create_session_factory(engine: AsyncEngine) -> async_sessionmaker[AsyncSession]:
    return async_sessionmaker(engine, expire_on_commit=False)


async def session_scope(factory: async_sessionmaker[AsyncSession]) -> AsyncIterator[AsyncSession]:
    """One session per request; rollback on error, always closed."""
    async with factory() as session:
        try:
            yield session
        except Exception:
            await session.rollback()
            raise


def migration_head() -> str | None:
    """Head revision of the Alembic script directory (what the code expects)."""
    script = ScriptDirectory.from_config(Config(str(ALEMBIC_INI)))
    return script.get_current_head()


@dataclass(frozen=True, slots=True)
class ReadinessResult:
    ready: bool
    database: bool
    migrations: bool
    current_revision: str | None
    expected_revision: str | None
    latency_ms: float
    error: str | None = None
    rls_enforced: bool | None = None


ROLE_BYPASS_QUERY = text("SELECT rolsuper OR rolbypassrls FROM pg_roles WHERE rolname = current_user")


async def role_bypasses_rls(engine: AsyncEngine) -> bool | None:
    """True when the connected role ignores row-level security; None when the database is unreachable."""
    try:
        async with engine.connect() as conn:
            return bool((await conn.execute(ROLE_BYPASS_QUERY)).scalar_one())
    except Exception as exc:  # noqa: BLE001 — a startup probe must not crash on an unreachable database
        log.warning("db_role_check_unavailable", error_type=type(exc).__name__)
        return None


async def check_readiness(engine: AsyncEngine, *, require_rls: bool = False) -> ReadinessResult:
    """Ping the database, compare the applied migration with the expected head and check the role (RLS)."""
    started = time.perf_counter()
    expected = migration_head()
    try:
        async with engine.connect() as conn:
            await conn.execute(text("SELECT 1"))
            has_table = (
                await conn.execute(text("SELECT to_regclass('public.alembic_version') IS NOT NULL"))
            ).scalar_one()
            current = (
                (await conn.execute(text("SELECT version_num FROM alembic_version"))).scalar_one_or_none()
                if has_table
                else None
            )
            bypass = bool((await conn.execute(ROLE_BYPASS_QUERY)).scalar_one())
    except Exception as exc:  # noqa: BLE001 — readiness must report, never crash
        latency = round((time.perf_counter() - started) * 1000, 1)
        log.warning("readiness_db_unreachable", error_type=type(exc).__name__, latency_ms=latency)
        return ReadinessResult(False, False, False, None, expected, latency, type(exc).__name__)
    latency = round((time.perf_counter() - started) * 1000, 1)
    migrations_ok = current == expected
    ready = migrations_ok and (not bypass or not require_rls)
    result = ReadinessResult(ready, True, migrations_ok, current, expected, latency, rls_enforced=not bypass)
    log.info(
        "readiness_checked",
        ready=result.ready,
        current_revision=current,
        expected_revision=expected,
        rls_enforced=not bypass,
        latency_ms=latency,
    )
    return result
