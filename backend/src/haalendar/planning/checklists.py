"""Checklist items of notes (FR-TODO-02, domain model 5.10, owner decision D-88).

+++===+++ 2026-10-29 — Hasan Alizada — HAAL-101. Written through sync: create on a live note (text 1-500 after trimming,
position required, at most MAX_ITEMS live items per note), field-level update of text, checked and position (checking
stamps the server's time, unchecking clears it), soft delete and restore of one item (its own batch). Rights are the
note's: its owner or an edit share. The note's delete takes its items into the same batch (planning.service).
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from haalendar.authz import require
from haalendar.errors import ProblemCode, ProblemError
from haalendar.logging import get_logger
from haalendar.planning.models import ChecklistItem, Item
from haalendar.planning.notes import checked_position
from haalendar.planning.service import Outcome, merge
from haalendar.security.rls import ContainerKind
from haalendar.softdelete import new_batch, restore_batch

log = get_logger(__name__)

MAX_ITEMS = 200
TEXT_MAX = 500
FIELDS = ("text", "checked", "position")


def _problem(field: str, message: str) -> ProblemError:
    return ProblemError(
        422,
        ProblemCode.VALIDATION_FAILED,
        "Invalid checklist item",
        errors=[{"field": field, "message": message}],
    )


def _not_found() -> ProblemError:
    return ProblemError(404, ProblemCode.NOT_FOUND, "Not found")


def checked_text(value: Any) -> str:
    if not isinstance(value, str) or not value.strip():
        raise _problem("text", "Enter some text")
    if len(value.strip()) > TEXT_MAX:
        raise _problem("text", f"At most {TEXT_MAX} characters")
    return value.strip()


async def _writable(db: AsyncSession, user_id: uuid.UUID, kind: str, container_id: uuid.UUID) -> None:
    container: ContainerKind = "note" if kind == "note" else "board"
    await require(db, user_id, "write_items", container, container_id)


def state_of(row: ChecklistItem) -> dict[str, Any]:
    return {"text": row.text, "checked": row.checked, "position": row.position}


async def create_checklist_item(
    db: AsyncSession, user_id: uuid.UUID, row_id: uuid.UUID, data: dict[str, Any]
) -> Outcome:
    if await db.get(ChecklistItem, row_id) is not None:
        raise ProblemError(409, ProblemCode.DUPLICATE, "A checklist item with this id exists")
    item = await db.get(Item, uuid.UUID(str(data["item_id"])))
    if item is None:
        raise _not_found()
    if item.kind != "note":
        raise ProblemError(422, ProblemCode.VALIDATION_FAILED, "Only notes have checklists so far")
    await _writable(db, user_id, item.container_kind, item.container_id)
    if item.deleted_at is not None:
        raise ProblemError(409, ProblemCode.INVALID_STATE, "The note was deleted on another device")
    count = await db.scalar(
        select(func.count())
        .select_from(ChecklistItem)
        .where(ChecklistItem.item_id == item.id, ChecklistItem.deleted_at.is_(None))
    )
    if (count or 0) >= MAX_ITEMS:
        raise ProblemError(409, ProblemCode.INVALID_STATE, f"A checklist holds at most {MAX_ITEMS} items")
    if "position" not in data:
        raise _problem("position", "Required")
    checked = bool(data.get("checked"))
    row = ChecklistItem(
        id=row_id,
        item_id=item.id,
        container_kind=item.container_kind,
        container_id=item.container_id,
        text=checked_text(data.get("text")),
        checked=checked,
        checked_at=datetime.now(UTC) if checked else None,
        position=checked_position(data["position"]),
        created_by=user_id,
        updated_by=user_id,
    )
    db.add(row)
    await db.flush()
    log.info("checklist_item_created", checklist_item_id=str(row_id), item_id=str(item.id))
    return Outcome(version=row.version)


async def _row(db: AsyncSession, user_id: uuid.UUID, row_id: uuid.UUID) -> ChecklistItem:
    row = await db.get(ChecklistItem, row_id)
    if row is None:
        raise _not_found()
    await _writable(db, user_id, row.container_kind, row.container_id)
    return row


async def update_checklist_item(
    db: AsyncSession,
    user_id: uuid.UUID,
    row_id: uuid.UUID,
    base: dict[str, Any],
    new: dict[str, Any],
    current_state: dict[str, Any],
) -> Outcome:
    row = await _row(db, user_id, row_id)
    if row.deleted_at is not None:
        raise ProblemError(
            409, ProblemCode.INVALID_STATE, "It was deleted on another device", current=current_state
        )
    apply, conflicts = merge(state_of(row), base, new)
    if apply:
        if "text" in apply:
            row.text = checked_text(apply["text"])
        if "position" in apply:
            row.position = checked_position(apply["position"])
        if "checked" in apply:
            row.checked = bool(apply["checked"])
            row.checked_at = datetime.now(UTC) if row.checked else None
        row.version += 1
        row.updated_by = user_id
        await db.flush()
    log.info(
        "checklist_item_updated", checklist_item_id=str(row_id), fields=sorted(apply), conflicts=conflicts
    )
    return Outcome(version=row.version, conflicts=conflicts)


async def delete_checklist_item(db: AsyncSession, user_id: uuid.UUID, row_id: uuid.UUID) -> Outcome:
    row = await _row(db, user_id, row_id)
    if row.deleted_at is None:
        row.deleted_at, row.delete_batch_id, row.updated_by = datetime.now(UTC), new_batch(), user_id
        row.version += 1
        await db.flush()
        log.info("checklist_item_deleted", checklist_item_id=str(row_id), user_id=str(user_id))
    return Outcome(version=row.version)


async def restore_checklist_item(db: AsyncSession, user_id: uuid.UUID, row_id: uuid.UUID) -> Outcome:
    row = await _row(db, user_id, row_id)
    if row.deleted_at is not None and row.delete_batch_id is not None:
        await restore_batch(db, [ChecklistItem], row.delete_batch_id, user_id)
        await db.refresh(row)
    return Outcome(version=row.version)
