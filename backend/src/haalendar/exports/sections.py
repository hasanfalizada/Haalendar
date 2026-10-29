"""Export sections: what each module contributes to the archive (owner decision D-48).

+++===+++ 2026-10-18 — Hasan Alizada — HAAL-043. "Mine" = the containers the user owns and everything in them, whoever
created it; nothing from other people's containers (their owners export those, ADR-0005). Soft-deleted records are
included with deleted_at. A module adds a Section to SECTIONS; today the calendar module contributes calendars, their
iCalendar files and the attachments of items in them. The To-Do and Kanban sections come with their modules.
+++===+++ 2026-10-29 — Hasan Alizada — HAAL-100. To-Do: the user's notes (archived and deleted ones included) and
their attachments.
+++===+++ 2026-10-29 — Hasan Alizada — HAAL-101. And the notes' checklist items (deleted ones included).
+++===+++ 2026-10-29 — Hasan Alizada — HAAL-110. Kanban: the user's boards (archived and deleted ones included); their
columns and cards join with HAAL-111/112.
+++===+++ 2026-10-29 — Hasan Alizada — HAAL-111. Each board carries its columns (deleted ones included), left to right.
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
from haalendar.planning.models import Board, BoardColumn, Calendar, ChecklistItem, Item, Note
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


async def todo_section(ctx: ExportContext) -> None:
    rows = (
        await ctx.db.execute(
            select(Item, Note)
            .join(Note, Note.id == Item.id)
            .where(Item.kind == "note", Item.owner_id == ctx.owner_id)
            .order_by(Note.pinned.desc(), Note.position.collate("C"), Item.id)
        )
    ).all()
    for item, note in rows:
        ctx.archive.add_row(
            "notes",
            {
                "id": item.id,
                "owner_id": item.owner_id,
                "title": item.title,
                "body": item.body,
                "color": item.color,
                "priority": item.priority,
                "pinned": note.pinned,
                "archived_at": note.archived_at,
                "position": note.position,
                "due_at": note.due_at,
                "is_checklist": note.is_checklist,
                "permission": "owner",
                **_meta(item),
            },
        )
    ids = [item.id for item, _ in rows]
    if ids:
        checklist = await ctx.db.scalars(
            select(ChecklistItem)
            .where(ChecklistItem.item_id.in_(ids))
            .order_by(ChecklistItem.item_id, ChecklistItem.position.collate("C"), ChecklistItem.id)
        )
        for entry in checklist:
            ctx.archive.add_row(
                "checklist_items",
                {
                    "id": entry.id,
                    "item_id": entry.item_id,
                    "text": entry.text,
                    "checked": entry.checked,
                    "checked_at": entry.checked_at,
                    "position": entry.position,
                    **_meta(entry),
                },
            )
    await _attachments(ctx, "note", ids, "todo")


async def kanban_section(ctx: ExportContext) -> None:
    boards = list(
        await ctx.db.scalars(
            select(Board)
            .where(Board.owner_id == ctx.owner_id)
            .order_by(Board.position.collate("C"), Board.id)
        )
    )
    columns: dict[uuid.UUID, list[dict[str, Any]]] = {board.id: [] for board in boards}
    if boards:
        for column in await ctx.db.scalars(
            select(BoardColumn)
            .where(BoardColumn.board_id.in_(list(columns)))
            .order_by(BoardColumn.board_id, BoardColumn.position.collate("C"), BoardColumn.id)
        ):
            columns[column.board_id].append(
                {
                    "id": column.id,
                    "board_id": column.board_id,
                    "name": column.name,
                    "position": column.position,
                    "wip_limit": column.wip_limit,
                    "archived_at": column.archived_at,
                    **_meta(column),
                }
            )
    for board in boards:
        ctx.archive.add_row(
            "boards",
            {
                "id": board.id,
                "owner_id": board.owner_id,
                "name": board.name,
                "position": board.position,
                "archived_at": board.archived_at,
                "permission": "owner",
                "columns": columns[board.id],
                **_meta(board),
            },
        )


SECTIONS: dict[Module, list[Section]] = {
    "calendar": [calendar_section],
    "todo": [todo_section],
    "kanban": [kanban_section],
}
