"""Background jobs on PostgreSQL with Procrastinate (ADR-0003, owner decision D-48).

+++===+++ 2026-10-18 — Hasan Alizada — HAAL-043. Each process builds its Procrastinate app with its own connection
(make_job_app): the API defers jobs (JobQueue), the worker process (`haalendar-worker`) runs them. Jobs connect as the
application role, so row-level security applies to everything they read. Today: building data export archives. The
queue keeps finished jobs (no deletion); only the worker registry is service data that the library cleans up itself
(haalendar.security.no_delete.SERVICE_TABLES).
"""

from __future__ import annotations

import asyncio
import uuid

from procrastinate import App, PsycopgConnector
from sqlalchemy.engine import make_url

from haalendar.config import Settings, load_settings
from haalendar.logging import configure_logging, get_logger

log = get_logger(__name__)

EXPORT_QUEUE = "exports"
BUILD_EXPORT = "build_export"


def connector_for(settings: Settings, pool_size: int = 4) -> PsycopgConnector:
    """Connector on the application role."""
    url = make_url(settings.database_url.get_secret_value()).set(drivername="postgresql")
    return PsycopgConnector(
        conninfo=url.render_as_string(hide_password=False), min_size=1, max_size=pool_size
    )


def make_job_app(settings: Settings, pool_size: int = 4) -> App:
    """The Procrastinate app of this process with its task definitions."""
    app = App(connector=connector_for(settings, pool_size))

    @app.task(name=BUILD_EXPORT, queue=EXPORT_QUEUE, retry=2)
    async def build_export(export_id: str, owner_id: str) -> None:
        from haalendar.exports.service import build  # the export code is loaded only where jobs run

        await build(settings, uuid.UUID(export_id), uuid.UUID(owner_id))

    return app


class JobQueue:
    """The API side of the queue: the connection pool opens on the first deferred job (the API also starts while the
    database is unreachable — offline-first clients, readiness reports it) and closes with the app."""

    def __init__(self, settings: Settings) -> None:
        self.app = make_job_app(settings, pool_size=2)
        self._opened = False
        self._lock = asyncio.Lock()

    async def _ensure_open(self) -> None:
        async with self._lock:
            if not self._opened:
                await self.app.open_async()
                self._opened = True

    async def close(self) -> None:
        if self._opened:
            await self.app.connector.close_async()
            self._opened = False

    async def defer_export(self, export_id: uuid.UUID, owner_id: uuid.UUID) -> int:
        await self._ensure_open()
        job_id = await self.app.configure_task(BUILD_EXPORT, queueing_lock=f"export:{export_id}").defer_async(
            export_id=str(export_id), owner_id=str(owner_id)
        )
        log.info("export_job_deferred", export_id=str(export_id), job_id=job_id)
        return job_id


def run_worker() -> None:
    """Entry point `haalendar-worker`: run queued jobs until stopped (SIGINT/SIGTERM finish the current job first)."""
    settings = load_settings()
    configure_logging(settings)
    app = make_job_app(settings)

    async def main() -> None:
        async with app.open_async():
            log.info("worker_started", queues=[EXPORT_QUEUE])
            await app.run_worker_async(queues=[EXPORT_QUEUE], install_signal_handlers=True)
        log.info("worker_stopped")

    asyncio.run(main())
