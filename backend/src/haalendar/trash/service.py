"""Unified trash (FR-X-04, owner decision D-38): list newest deletions first, restore whole delete batches.

+++===+++ 2026-10-16 — Hasan Alizada — HAAL-033.
- Sources: every soft-deletable type registers a TrashSource (model, title, who may restore, children restored with
  its batch, how to find a container that is itself in the trash). Today: calendars; events, notes, boards, columns
  and cards register with their modules.
- One entry per delete batch: a row deleted together with its container is shown inside the container's entry
  (`contents`), not on its own. Rows deleted one by one are separate entries.
- Who may restore: own content and content in containers shared with edit permission; deleted containers only by
  their owner. Everything runs under row-level security.
- Restoring an entry brings back its whole batch (restore_batch); the audit log records it. An item whose container
  is still in the trash is refused with parent_in_trash so the user can restore the container first or together.
- Nothing is ever purged.
"""

from __future__ import annotations

import base64
import json
import uuid
from collections.abc import Awaitable, Callable
from dataclasses import dataclass, field
from datetime import datetime
from typing import Any

from sqlalchemy import ColumnElement, func, select, tuple_
from sqlalchemy.ext.asyncio import AsyncSession

from haalendar.accounts.models import UserAccount
from haalendar.errors import ProblemCode, ProblemError
from haalendar.logging import get_logger
from haalendar.planning.models import Calendar
from haalendar.softdelete import restore_batch
from haalendar.trash.schemas import (
    FailureCode,
    ParentOut,
    RestoreEntryIn,
    RestoreFailureOut,
    RestoreOut,
    TrashEntryOut,
    TrashPageOut,
    TrashType,
)

log = get_logger(__name__)


@dataclass(frozen=True, slots=True)
class TrashSource:
    kind: TrashType
    model: type[Any]
    title: Callable[[Any], str]
    # SQL condition: rows of this source the user may restore (evaluated under row-level security as well).
    may_restore: Callable[[uuid.UUID], ColumnElement[bool]]
    # Code for a visible row the user may not restore (None = allowed).
    refuse: Callable[[Any, uuid.UUID], FailureCode | None]
    # Types restored and counted together with the batch: (type label, model).
    children: tuple[tuple[str, type[Any]], ...] = ()
    # SQL condition hiding rows that belong to a container deleted in the same batch (shown inside its entry).
    root_only: Callable[[], ColumnElement[bool] | None] = field(default=lambda: None)
    # Container of an item that is itself in the trash, or None.
    parent_in_trash: Callable[[AsyncSession, Any], Awaitable[ParentOut | None]] | None = None


SOURCES: dict[str, TrashSource] = {
    "calendar": TrashSource(
        kind="calendar",
        model=Calendar,
        title=lambda row: row.name,
        may_restore=lambda user_id: Calendar.owner_id == user_id,
        refuse=lambda row, user_id: None if row.owner_id == user_id else "forbidden",
    ),
}


def _encode(deleted_at: datetime, row_id: uuid.UUID) -> str:
    raw = json.dumps({"t": deleted_at.isoformat(), "id": str(row_id)}).encode()
    return base64.urlsafe_b64encode(raw).decode().rstrip("=")


def _decode(cursor: str) -> tuple[datetime, uuid.UUID]:
    try:
        data = json.loads(base64.urlsafe_b64decode(cursor + "=" * (-len(cursor) % 4)))
        return datetime.fromisoformat(data["t"]), uuid.UUID(data["id"])
    except ValueError, KeyError, TypeError:
        raise ProblemError(400, ProblemCode.BAD_REQUEST, "Invalid cursor") from None


async def _contents(db: AsyncSession, source: TrashSource, batch_id: uuid.UUID) -> dict[str, int]:
    counts: dict[str, int] = {}
    for label, model in source.children:
        count = await db.scalar(
            select(func.count()).select_from(model).where(model.delete_batch_id == batch_id)
        )
        if count:
            counts[label] = int(count)
    return counts


async def list_trash(
    db: AsyncSession, user_id: uuid.UUID, *, module: str | None, cursor: str | None, limit: int
) -> TrashPageOut:
    after = _decode(cursor) if cursor else None
    candidates: list[tuple[datetime, uuid.UUID, TrashSource, Any, str | None]] = []
    more = False
    for source in SOURCES.values():
        if module is not None and module != source.kind:
            continue
        model = source.model
        statement = (
            select(model, UserAccount.display_name)
            .outerjoin(UserAccount, UserAccount.id == model.updated_by)
            .where(model.deleted_at.is_not(None), source.may_restore(user_id))
            .order_by(model.deleted_at.desc(), model.id.desc())
            .limit(limit + 1)
        )
        root = source.root_only()
        if root is not None:
            statement = statement.where(root)
        if after is not None:
            statement = statement.where(tuple_(model.deleted_at, model.id) < tuple_(*after))
        rows = (await db.execute(statement)).all()
        more = more or len(rows) > limit
        candidates.extend((row.deleted_at, row.id, source, row, name) for row, name in rows)
    candidates.sort(key=lambda c: (c[0], c[1]), reverse=True)
    page, more = candidates[:limit], more or len(candidates) > limit
    entries = [
        TrashEntryOut(
            type=source.kind,
            id=row.id,
            title=source.title(row),
            deleted_at=row.deleted_at,
            deleted_by=row.updated_by,
            deleted_by_name=name,
            delete_batch_id=row.delete_batch_id,
            created_at=row.created_at,
            updated_at=row.updated_at,
            contents=await _contents(db, source, row.delete_batch_id),
        )
        for _, _, source, row, name in page
    ]
    next_cursor = _encode(page[-1][0], page[-1][1]) if more and page else None
    return TrashPageOut(data=entries, next_cursor=next_cursor)


async def restore(db: AsyncSession, user_id: uuid.UUID, entries: list[RestoreEntryIn]) -> RestoreOut:
    restored = rows = 0
    failed: list[RestoreFailureOut] = []
    seen: set[tuple[str, uuid.UUID]] = set()
    for entry in entries:
        if (entry.type, entry.id) in seen:
            continue
        seen.add((entry.type, entry.id))
        source = SOURCES.get(entry.type)
        if source is None:
            failed.append(RestoreFailureOut(type=entry.type, id=entry.id, code="unsupported"))
            continue
        model = source.model
        row = await db.scalar(
            select(model)
            .where(model.id == entry.id, model.deleted_at.is_not(None))
            .execution_options(populate_existing=True)
        )
        if row is None:
            failed.append(RestoreFailureOut(type=entry.type, id=entry.id, code="not_found"))
            continue
        refusal = source.refuse(row, user_id)
        if refusal is not None:
            failed.append(RestoreFailureOut(type=entry.type, id=entry.id, code=refusal))
            continue
        parent = await source.parent_in_trash(db, row) if source.parent_in_trash else None
        if parent is not None:
            failed.append(
                RestoreFailureOut(type=entry.type, id=entry.id, code="parent_in_trash", parent=parent)
            )
            continue
        batch = row.delete_batch_id
        rows += await restore_batch(db, [model, *(m for _, m in source.children)], batch, user_id)
        restored += 1
    log.info("trash_restore", user_id=str(user_id), restored=restored, rows=rows, failed=len(failed))
    return RestoreOut(restored=restored, rows=rows, failed=failed)
