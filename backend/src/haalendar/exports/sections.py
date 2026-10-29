"""Export sections: what each module contributes to the archive (owner decision D-48).

+++===+++ 2026-10-18 — Hasan Alizada — HAAL-043. "Mine" = the containers the user owns and everything in them, whoever
created it; nothing from other people's containers (their owners export those, ADR-0005). Soft-deleted records are
included with deleted_at. A module adds a Section to SECTIONS; today the calendar module contributes calendars, their
iCalendar files and the attachments of items in them. The To-Do and Kanban sections come with their modules.
"""

from __future__ import annotations

import asyncio
import uuid
from collections.abc import Awaitable, Callable
from dataclasses import dataclass
from datetime import datetime
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from haalendar.attachments.models import Attachment
from haalendar.exports.archive import ArchiveWriter, safe_name
from haalendar.exports.schemas import Module
from haalendar.planning.ics import calendar_ics
from haalendar.planning.ics_service import calendar_events
from haalendar.planning.models import Calendar, Item
from haalendar.storage import Storage


@dataclass(frozen=True, slots=True)
class ExportContext:
    db: AsyncSession
    storage: Storage
    owner_id: uuid.UUID
    include_images: bool
    exported_at: datetime
    archive: ArchiveWriter


Section = Callable[[ExportContext], Awaitable[None]]


def _meta(row: Any) -> dict[str, Any]:
    return {
        "created_at": row.created_at,
        "updated_at": row.updated_at,
        "created_by": row.created_by,
        "updated_by": row.updated_by,
        "deleted_at": row.deleted_at,
        "delete_batch_id": row.delete_batch_id,
        "version": row.version,
    }


async def _attachments(
    ctx: ExportContext, container_kind: str, container_ids: list[uuid.UUID], folder: str
) -> None:
    if not container_ids:
        return
    rows = await ctx.db.scalars(
        select(Attachment)
        .join(Item, Item.id == Attachment.item_id)
        .where(Attachment.container_kind == container_kind, Attachment.container_id.in_(container_ids))
        .order_by(Attachment.created_at, Attachment.id)
    )
    for row in rows:
        path = None
        if ctx.include_images:
            data = await asyncio.to_thread(ctx.storage.get, row.storage_key)
            if data is not None:
                path = f"{folder}/attachments/{str(row.id)[:8]}-{safe_name(row.file_name)}"
                ctx.archive.add_file(path, data)
        ctx.archive.add_row(
            "attachments",
            {
                "id": row.id,
                "item_id": row.item_id,
                "file_name": row.file_name,
                "media_type": row.media_type,
                "size_bytes": row.size_bytes,
                "width": row.width,
                "height": row.height,
                "content_hash": f"b3:{row.content_hash}",
                "url": f"/api/v1/attachments/{row.id}",
                "thumbnail_url": f"/api/v1/attachments/{row.id}/thumbnail",
                "archive_path": path,
                **_meta(row),
            },
        )


async def calendar_section(ctx: ExportContext) -> None:
    calendars = list(
        await ctx.db.scalars(
            select(Calendar)
            .where(Calendar.owner_id == ctx.owner_id)
            .order_by(Calendar.created_at, Calendar.id)
        )
    )
    for calendar in calendars:
        ctx.archive.add_row(
            "calendars",
            {
                "id": calendar.id,
                "owner_id": calendar.owner_id,
                "name": calendar.name,
                "color": calendar.color,
                "is_default": calendar.is_default,
                "archived_at": calendar.archived_at,
                "hidden": False,
                "permission": "owner",
                **_meta(calendar),
            },
        )
        if calendar.deleted_at is None:
            # +++===+++ 2026-10-29 — Hasan Alizada — HAAL-095. The calendar's live events (D-83; empty until now).
            ics = calendar_ics(calendar.name, await calendar_events(ctx.db, calendar.id), ctx.exported_at)
            ctx.archive.add_file(
                f"calendar/{safe_name(calendar.name, f' ({str(calendar.id)[:8]}).ics')}", ics
            )
    await _attachments(ctx, "calendar", [c.id for c in calendars], "calendar")


SECTIONS: dict[Module, list[Section]] = {
    "calendar": [calendar_section],
    "todo": [],
    "kanban": [],
}
