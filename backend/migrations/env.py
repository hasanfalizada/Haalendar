"""Alembic environment (async, psycopg 3).

+++===+++ 2026-10-14 — Hasan Alizada — HAAL-016. Runs migrations with the application settings so the URL and
secrets come from the environment only. Executed by the one-shot `migrate` service before app/worker start (ADR-0004).
+++===+++ 2026-10-15 — Hasan Alizada — HAAL-165. Migrations run as the owner role (HAALENDAR_MIGRATION_DATABASE_URL);
afterwards the application role's table privileges are refreshed, so a new table is never left without (or with too
many) grants.
"""

from __future__ import annotations

import asyncio

from alembic import context
from sqlalchemy.engine import Connection
from sqlalchemy.ext.asyncio import create_async_engine

import haalendar.accounts.models
import haalendar.attachments.models
import haalendar.audit.models
import haalendar.exports.models
import haalendar.planning.models
import haalendar.preferences.models  # noqa: F401 — registers the tables on Base.metadata
from haalendar.config import load_settings
from haalendar.dbroles import apply_app_grants
from haalendar.logging import configure_logging, get_logger
from haalendar.models import Base

settings = load_settings()
configure_logging(settings)
log = get_logger("haalendar.migrations")
target_metadata = Base.metadata


def run_offline() -> None:
    """Emit SQL without a database connection (`alembic upgrade head --sql`)."""
    context.configure(
        url=settings.migration_database_url.get_secret_value(),
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
    engine = create_async_engine(settings.migration_database_url.get_secret_value())
    log.info("migrations_starting")
    try:
        async with engine.connect() as connection:
            await connection.run_sync(_run_sync)
            await connection.commit()
    finally:
        await engine.dispose()
    log.info("migrations_finished")
    apply_app_grants(settings)


if context.is_offline_mode():
    run_offline()
else:
    asyncio.run(run_online())
