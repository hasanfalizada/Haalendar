"""The reset of the demo (`haalendar-demo`, the service `demo` of compose.demo.yaml; FR-OPS-03, D-103).

+++===+++ 2026-11-09 — Hasan Alizada — HAAL-154. A deliberate exception from "never physically delete" (owner's decision
D-103): this removes the whole database and all files, every 30 minutes. It therefore
- runs only with HAALENDAR_DEMO_MODE=true and only as this separate service;
- refuses when the database holds any account other than the demo accounts: compose.demo.yaml started by mistake on a
  real installation deletes nothing (a demo cannot get other accounts, its registration and setup are closed).
A minute before each mark a new database is built under another name (migrations, seed) while the old one keeps
working; at the mark the two swap names. A failed build changes nothing and is tried again at the next mark. A new
database means a new sync cursor epoch, so devices sync from the start and drop what is gone; sessions are gone too.
"""

from __future__ import annotations

import asyncio
import os
import shutil
import signal
import subprocess
import sys
import time
from datetime import UTC, datetime, timedelta
from pathlib import Path
from types import FrameType

import psycopg
from psycopg import sql
from pydantic import SecretStr
from sqlalchemy.engine import URL, make_url

from haalendar.config import Settings, load_settings
from haalendar.db import ALEMBIC_INI, create_engine, create_session_factory
from haalendar.dbroles import bootstrap
from haalendar.demo import ACCOUNTS, next_reset_at
from haalendar.demo.seed import seed
from haalendar.logging import configure_logging, get_logger

log = get_logger(__name__)

NEXT_SUFFIX = "_demo_next"
OLD_SUFFIX = "_demo_old"
PREPARE_SECONDS = 60
TERMINATE_WAIT_SECONDS = 10.0


class RefusedError(Exception):
    """This is not a demo database: nothing may be removed."""


def _libpq(url: URL) -> str:
    return url.set(drivername="postgresql").render_as_string(hide_password=False)


def _owner(settings: Settings) -> URL:
    return make_url(settings.migration_database_url.get_secret_value())


def _maintenance(settings: Settings) -> psycopg.Connection:
    return psycopg.connect(_libpq(_owner(settings).set(database="postgres")), autocommit=True)


def _exists(conn: psycopg.Connection, database: str) -> bool:
    return conn.execute("SELECT 1 FROM pg_database WHERE datname = %s", (database,)).fetchone() is not None


def _on_database(settings: Settings, database: str) -> Settings:
    """The same settings, connecting to another database."""

    def moved(url: SecretStr) -> SecretStr:
        changed = make_url(url.get_secret_value()).set(database=database)
        return SecretStr(changed.render_as_string(hide_password=False))

    return settings.model_copy(
        update={
            "database_url": moved(settings.database_url),
            "migration_database_url": moved(settings.migration_database_url),
        }
    )


def _drop(conn: psycopg.Connection, database: str) -> None:
    conn.execute(
        # physical-delete-allowed: the demo's own databases, only with demo mode on (D-103)
        sql.SQL("DROP DATABASE IF EXISTS {} WITH (FORCE)").format(sql.Identifier(database))
    )


def assert_only_demo_accounts(settings: Settings) -> None:
    """Raises RefusedError when the current database has an account that is not a demo account."""
    with _maintenance(settings) as conn:
        database = _owner(settings).database or ""
        if not _exists(conn, database):
            return
        conn.execute(sql.SQL("ALTER DATABASE {} ALLOW_CONNECTIONS true").format(sql.Identifier(database)))
    with psycopg.connect(_libpq(_owner(settings)), autocommit=True) as conn:
        found = conn.execute("SELECT to_regclass('public.user_account') IS NOT NULL").fetchone()
        if not found or not found[0]:
            return
        row = conn.execute(
            "SELECT count(*) FROM user_account WHERE lower(email) <> ALL(%s)",
            ([account.email for account in ACCOUNTS],),
        ).fetchone()
    if row and row[0]:
        raise RefusedError(f"{row[0]} accounts other than the demo accounts: this is not a demo database")


def prepare(settings: Settings, now: datetime) -> None:
    """Builds the next database next to the current one."""
    database = _owner(settings).database or ""
    target = database + NEXT_SUFFIX
    with _maintenance(settings) as conn:
        _drop(conn, target)
        conn.execute(sql.SQL("CREATE DATABASE {}").format(sql.Identifier(target)))
    moved = _on_database(settings, target)
    bootstrap(moved)
    # A process of its own: the migrations read their database from the environment and run their own event loop.
    subprocess.run(
        [sys.executable, "-m", "alembic", "upgrade", "head"],
        cwd=ALEMBIC_INI.parent,
        check=True,
        env={
            **os.environ,
            "HAALENDAR_DATABASE_URL": moved.database_url.get_secret_value(),
            "HAALENDAR_MIGRATION_DATABASE_URL": moved.migration_database_url.get_secret_value(),
        },
    )

    async def fill() -> None:
        engine = create_engine(moved)
        try:
            await seed(create_session_factory(engine), now)
        finally:
            await engine.dispose()

    asyncio.run(fill())


def _close_connections(conn: psycopg.Connection, database: str) -> None:
    """Connections are closed asynchronously, so wait until none is left."""
    deadline = time.monotonic() + TERMINATE_WAIT_SECONDS
    while True:
        row = conn.execute(
            "SELECT count(pg_terminate_backend(pid)) FROM pg_stat_activity "
            "WHERE datname = %s AND pid <> pg_backend_pid()",
            (database,),
        ).fetchone()
        if not row or not row[0]:
            return
        if time.monotonic() > deadline:
            raise RuntimeError(f"{row[0]} connections stayed open")
        time.sleep(0.1)


def swap(settings: Settings) -> None:
    """Puts the prepared database in place, then removes the old one and all files."""
    assert_only_demo_accounts(settings)
    database = _owner(settings).database or ""
    prepared, old = database + NEXT_SUFFIX, database + OLD_SUFFIX
    ident = sql.Identifier
    with _maintenance(settings) as conn:
        _drop(conn, old)
        if _exists(conn, database):
            conn.execute(sql.SQL("ALTER DATABASE {} ALLOW_CONNECTIONS false").format(ident(database)))
            _close_connections(conn, database)
            conn.execute(sql.SQL("ALTER DATABASE {} RENAME TO {}").format(ident(database), ident(old)))
        conn.execute(sql.SQL("ALTER DATABASE {} RENAME TO {}").format(ident(prepared), ident(database)))
        _drop(conn, old)
    if settings.storage_dir:
        for entry in Path(settings.storage_dir).iterdir():
            if entry.is_dir() and not entry.is_symlink():
                shutil.rmtree(
                    entry
                )  # physical-delete-allowed: the demo's uploaded files, demo mode only (D-103)
            else:
                entry.unlink()  # physical-delete-allowed: the demo's uploaded files, demo mode only (D-103)


def reset(settings: Settings, now: datetime | None = None) -> None:
    """Prepare and swap at once."""
    if not settings.demo_mode:
        raise RefusedError("HAALENDAR_DEMO_MODE is off")
    assert_only_demo_accounts(settings)
    prepare(settings, now or datetime.now(UTC))
    swap(settings)
    log.info("demo_reset_done")


def _mark_after(now: datetime) -> datetime:
    """The next mark that leaves time to prepare."""
    return next_reset_at(now + timedelta(seconds=PREPARE_SECONDS))


def _sleep_until(moment: datetime) -> None:
    pause = (moment - datetime.now(UTC)).total_seconds()
    if pause > 0:
        time.sleep(pause)


def _stop(_signum: int, _frame: FrameType | None) -> None:
    sys.exit(0)


def run() -> None:
    """Entry point `haalendar-demo`: a reset now, then one at every mark, until stopped."""
    settings = load_settings()
    configure_logging(settings)
    # As the first process of a container it would otherwise ignore the stop signal.
    signal.signal(signal.SIGTERM, _stop)
    try:
        reset(settings)
    except RefusedError as refused:
        log.error("demo_reset_refused", reason=str(refused))
        sys.exit(1)
    while True:
        mark = _mark_after(datetime.now(UTC))
        _sleep_until(mark - timedelta(seconds=PREPARE_SECONDS))
        try:
            prepare(settings, mark)
            _sleep_until(mark)
            swap(settings)
            log.info("demo_reset_done", mark=mark.isoformat())
        except RefusedError as refused:
            log.error("demo_reset_refused", reason=str(refused))
            sys.exit(1)
        except (psycopg.Error, subprocess.CalledProcessError, RuntimeError, OSError) as error:
            log.error("demo_reset_failed", error_type=type(error).__name__)
