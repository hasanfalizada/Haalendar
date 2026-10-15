"""Alembic environment (async, psycopg 3).

+++===+++ 2026-10-14 — Hasan Alizada — HAAL-016. Runs migrations with the application settings so the URL and
secrets come from the environment only. Executed by the one-shot `migrate` service before app/worker start (ADR-0004).
"""

from __future__ import annotations

import asyncio

from alembic import context
from sqlalchemy.engine import Connection
from sqlalchemy.ext.asyncio import create_async_engine

import haalendar.accounts.models  # noqa: F401 — registers account tables on Base.metadata
from haalendar.config import load_settings
from haalendar.logging import configure_logging, get_logger
from haalendar.models import Base

settings = load_settings()
configure_logging(settings)
log = get_logger("haalendar.migrations")
target_metadata = Base.metadata


def run_offline() -> None:
    """Emit SQL without a database connection (`alembic upgrade head --sql`)."""
    context.configure(
        url=settings.database_url.get_secret_value(),
        target_metadata=target_metadata,
        literal_binds=True,
        compare_type=True,
    )
    with context.begin_transaction():
        context.run_migrations()


def _run_sync(connection: Connection) -> None:
    context.configure(connection=connection, target_metadata=target_metadata, compare_type=True)
    with context.begin_transaction():
        context.run_migrations()


async def run_online() -> None:
    engine = create_async_engine(settings.database_url.get_secret_value())
    log.info("migrations_starting")
    try:
        async with engine.connect() as connection:
            await connection.run_sync(_run_sync)
            await connection.commit()
    finally:
        await engine.dispose()
    log.info("migrations_finished")


if context.is_offline_mode():
    run_offline()
else:
    asyncio.run(run_online())
