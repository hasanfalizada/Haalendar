"""Export use cases (FR-X-14, owner decision D-48: Google-Takeout style).

+++===+++ 2026-10-18 — Hasan Alizada — HAAL-043.
- request: needs a recent password confirmation; one export at a time per user; the row is stored and a background job
  is queued (the worker builds the archive).
- build (worker): runs as the requesting user under row-level security, writes the ZIP, marks the request ready for
  7 days and sends an e-mail when mail is configured; failures are recorded with a code (details in the log).
- list / download: the user's own requests, newest first; an expired archive is removed when it is next looked at
  (archives are service data; the request row stays for good).
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import cast

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from haalendar.accounts.mailer import create_mailer
from haalendar.accounts.models import UserAccount
from haalendar.config import Settings
from haalendar.db import create_engine, create_session_factory
from haalendar.deps import USER_ID_SETTING
from haalendar.errors import ProblemCode, ProblemError
from haalendar.exports.archive import SCHEMA_VERSION, ArchiveWriter, readme_html
from haalendar.exports.models import ExportRequest
from haalendar.exports.schemas import ExportOut, Module
from haalendar.exports.sections import SECTIONS, ExportContext, links_section
from haalendar.logging import get_logger
from haalendar.notifications.service import notify_self
from haalendar.preferences.service import get_settings
from haalendar.preferences.service import to_out as settings_to_out
from haalendar.storage import Storage, create_storage

log = get_logger(__name__)

KEEP_FOR = timedelta(days=7)
ACTIVE = ("queued", "running")
MODULE_ORDER = ("calendar", "todo", "kanban")


def to_out(row: ExportRequest) -> ExportOut:
    ready = row.status == "ready"
    return ExportOut(
        id=row.id,
        status=row.status,  # checked by the table constraint
        modules=list(row.modules),  # validated on input
        include_images=row.include_images,
        requested_at=row.requested_at,
        finished_at=row.finished_at,
        expires_at=row.expires_at,
        size_bytes=row.size_bytes,
        counts=row.counts,
        error=row.error,
        download_url=f"/api/v1/exports/{row.id}/download" if ready else None,
    )


async def request_export(
    db: AsyncSession, owner_id: uuid.UUID, modules: list[str], include_images: bool
) -> ExportRequest:
    active = await db.scalar(
        select(func.count()).where(ExportRequest.owner_id == owner_id, ExportRequest.status.in_(ACTIVE))
    )
    if active:
        raise ProblemError(409, ProblemCode.INVALID_STATE, "An export is already being prepared")
    row = ExportRequest(
        owner_id=owner_id,
        modules=[m for m in MODULE_ORDER if m in set(modules)],
        include_images=include_images,
    )
    db.add(row)
    await db.flush()
    await db.refresh(row)
    log.info(
        "export_requested",
        export_id=str(row.id),
        user_id=str(owner_id),
        modules=row.modules,
        images=include_images,
    )
    return row


async def _expire(db: AsyncSession, storage: Storage, row: ExportRequest, now: datetime) -> None:
    if row.status == "ready" and row.expires_at is not None and row.expires_at <= now:
        if row.file_key:
            storage.remove_export(row.file_key)
        row.status = "expired"
        row.version += 1
        log.info("export_expired", export_id=str(row.id))


async def list_exports(db: AsyncSession, storage: Storage, owner_id: uuid.UUID) -> list[ExportRequest]:
    rows = list(
        await db.scalars(
            select(ExportRequest)
            .where(ExportRequest.owner_id == owner_id)
            .order_by(ExportRequest.requested_at.desc())
            .limit(20)
        )
    )
    now = datetime.now(UTC)
    for row in rows:
        await _expire(db, storage, row, now)
    return rows


async def archive_for_download(
    db: AsyncSession, storage: Storage, owner_id: uuid.UUID, export_id: uuid.UUID
) -> tuple[ExportRequest, Path]:
    row = await db.scalar(
        select(ExportRequest).where(ExportRequest.id == export_id, ExportRequest.owner_id == owner_id)
    )
    if row is None:
        raise ProblemError(404, ProblemCode.NOT_FOUND, "Not found")
    await _expire(db, storage, row, datetime.now(UTC))
    if row.status != "ready" or not row.file_key:
        raise ProblemError(409, ProblemCode.INVALID_STATE, "This export is not available for download")
    path = storage.export_path(row.file_key)
    if not path.is_file():
        log.error("export_archive_missing", export_id=str(row.id))
        raise ProblemError(404, ProblemCode.NOT_FOUND, "The archive is missing")
    log.info("export_downloaded", export_id=str(row.id), user_id=str(owner_id))
    return row, path


async def _as_user(db: AsyncSession, owner_id: uuid.UUID) -> None:
    await db.execute(select(func.set_config(USER_ID_SETTING, str(owner_id), True)))


async def build(settings: Settings, export_id: uuid.UUID, owner_id: uuid.UUID) -> None:
    """Worker side: build the archive of one export request."""
    engine = create_engine(settings)
    factory = create_session_factory(engine)
    storage = create_storage(settings)
    try:
        async with factory() as db, db.begin():
            await _as_user(db, owner_id)
            row = await db.get(ExportRequest, export_id)
            if row is None or row.status != "queued":
                log.warning(
                    "export_job_skipped", export_id=str(export_id), status=row.status if row else None
                )
                return
            row.status = "running"
            row.started_at = datetime.now(UTC)
            row.version += 1
        try:
            await _write_archive(factory, storage, export_id, owner_id)
        except Exception:
            log.exception("export_failed", export_id=str(export_id))
            async with factory() as db, db.begin():
                await _as_user(db, owner_id)
                failed = await db.get(ExportRequest, export_id)
                if failed is not None:
                    failed.status = "failed"
                    failed.error = "internal_error"
                    failed.finished_at = datetime.now(UTC)
                    failed.version += 1
                    if failed.file_key:
                        storage.remove_export(failed.file_key)
            return
        await _notify(factory, settings, export_id, owner_id)
    finally:
        await engine.dispose()


Factory = async_sessionmaker[AsyncSession]


async def _write_archive(
    factory: Factory, storage: Storage, export_id: uuid.UUID, owner_id: uuid.UUID
) -> None:
    async with factory() as db, db.begin():
        await _as_user(db, owner_id)
        row = await db.get(ExportRequest, export_id)
        user = await db.get(UserAccount, owner_id)
        assert row is not None and user is not None
        now = datetime.now(UTC)
        key = storage.export_key(owner_id, export_id)
        # +++===+++ 2026-10-19 — Hasan Alizada — HAAL-045. The user's settings are part of "all my data" (schema 1.x,
        # additive).
        settings_row = await get_settings(db, owner_id)
        header = {
            "format": "haalendar-export",
            "schema_version": SCHEMA_VERSION,
            "exported_at": now,
            "user": {
                "id": user.id,
                "email": user.email,
                "display_name": user.display_name,
                "time_zone": user.time_zone,
            },
            "settings": settings_to_out(settings_row).model_dump(mode="json", exclude={"version"}),
            "modules": list(row.modules),
            "include_images": row.include_images,
        }
        path = storage.export_path(key)
        with ArchiveWriter(path, header) as archive:
            ctx = ExportContext(db, storage, owner_id, row.include_images, now, archive)
            for module in row.modules:
                for section in SECTIONS.get(cast(Module, module), []):
                    await section(ctx)
            # +++===+++ 2026-10-30 — Hasan Alizada — HAAL-120. Links across the modules, once (D-98).
            await links_section(ctx, list(row.modules))
            archive.finish(readme_html(header, archive.counts, archive.files))
            counts = dict(archive.counts)
        row.status = "ready"
        row.file_key = key
        row.size_bytes = path.stat().st_size
        row.counts = counts
        row.finished_at = datetime.now(UTC)
        row.expires_at = row.finished_at + KEEP_FOR
        row.version += 1
        log.info("export_ready", export_id=str(export_id), size_bytes=row.size_bytes, counts=counts)
        # +++===+++ 2026-10-19 — Hasan Alizada — HAAL-048. Announced in the notification center as well (D-48, D-52).
        await notify_self(
            db,
            owner_id,
            "export_ready",
            {
                "export_id": str(export_id),
                "size_bytes": row.size_bytes,
                "expires_at": row.expires_at.isoformat(),
            },
        )


async def _notify(factory: Factory, settings: Settings, export_id: uuid.UUID, owner_id: uuid.UUID) -> None:
    async with factory() as db, db.begin():
        await _as_user(db, owner_id)
        user = await db.get(UserAccount, owner_id)
        row = await db.get(ExportRequest, export_id)
    if user is None or row is None or row.expires_at is None:
        return
    sent = await create_mailer(settings).send(
        user.email,
        "Haalendar: your data export is ready",
        f"Hello {user.display_name},\n\nyour Haalendar export is ready. Download it in Settings → Your data:\n"
        f"{settings.public_url.rstrip('/')}/settings#export\n\n"
        f"The archive can be downloaded until {row.expires_at:%Y-%m-%d %H:%M} UTC.\n",
    )
    log.info("export_ready_mail", export_id=str(export_id), sent=sent)
