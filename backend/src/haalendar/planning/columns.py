"""Columns of Kanban boards (FR-KAN-02, domain model 5.3, owner decision D-91).

+++===+++ 2026-10-29 — Hasan Alizada — HAAL-111. Written through sync by the board's owner or an edit share (not on an
archived board — haalendar.authz):
- create on a live board: name 1-60 (trimmed, not blank), position required (fractional index, left to right), an
  optional WIP limit (1-999; exceeding it only warns, nothing is refused because of it), archived_at;
- update: field-level merge of name, position, wip_limit and archived_at (any timestamp archives — the server keeps its
  own time —, null unarchives; merged as archived or not);
- delete: soft, the column in a batch of its own (its cards join with HAAL-112); restore brings the batch back. A
  board's delete takes its columns into the board's batch (planning.boards).
+++===+++ 2026-10-29 — Hasan Alizada — HAAL-112. A column's delete takes its cards into its batch, with their attachments,
checklist items and labels; restoring the column brings them back.
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime
from typing import Any

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from haalendar.attachments.models import Attachment
from haalendar.authz import require
from haalendar.errors import ProblemCode, ProblemError
from haalendar.logging import get_logger
from haalendar.planning.models import Board, BoardColumn, Card, ChecklistItem, Item, ItemLabel
from haalendar.planning.notes import checked_position
from haalendar.planning.service import Outcome, merge
from haalendar.softdelete import new_batch, restore_batch

log = get_logger(__name__)

NAME_MAX = 60
WIP_MAX = 999


def _problem(field: str, message: str) -> ProblemError:
    return ProblemError(
        422, ProblemCode.VALIDATION_FAILED, "Invalid column", errors=[{"field": field, "message": message}]
    )


def _not_found() -> ProblemError:
    return ProblemError(404, ProblemCode.NOT_FOUND, "Not found")


def checked_name(value: Any) -> str:
    if not isinstance(value, str) or not value.strip():
        raise _problem("name", "Enter a name")
    if len(value.strip()) > NAME_MAX:
        raise _problem("name", f"At most {NAME_MAX} characters")
    return value.strip()


def checked_wip_limit(value: Any) -> int | None:
    if value is None:
        return None
    if isinstance(value, bool) or not isinstance(value, int) or not 1 <= value <= WIP_MAX:
        raise _problem("wip_limit", f"Use a number from 1 to {WIP_MAX}, or none")
    return value


def state_of(row: BoardColumn) -> dict[str, Any]:
    # The archive state merges as archived or not: the client sends its own time, the server keeps its own.
    return {
        "name": row.name,
        "position": row.position,
        "wip_limit": row.wip_limit,
        "archived_at": row.archived_at is not None,
    }


def _archived_flag(values: dict[str, Any]) -> dict[str, Any]:
    return {**values, "archived_at": values["archived_at"] is not None} if "archived_at" in values else values


async def _writable(db: AsyncSession, user_id: uuid.UUID, board_id: uuid.UUID) -> None:
    await require(db, user_id, "write_items", "board", board_id)


async def create_column(
    db: AsyncSession, user_id: uuid.UUID, row_id: uuid.UUID, data: dict[str, Any]
) -> Outcome:
    if await db.get(BoardColumn, row_id) is not None:
        raise ProblemError(409, ProblemCode.DUPLICATE, "A column with this id exists")
    board_id = data.get("board_id")
    if board_id is None:
        raise _problem("board_id", "Required")
    board = await db.get(Board, board_id)
    if board is None:
        raise _not_found()
    await _writable(db, user_id, board.id)
    if "position" not in data:
        raise _problem("position", "Required")
    row = BoardColumn(
        id=row_id,
        board_id=board.id,
        container_kind="board",
        container_id=board.id,
        name=checked_name(data.get("name")),
        position=checked_position(data["position"]),
        wip_limit=checked_wip_limit(data.get("wip_limit")),
        archived_at=datetime.now(UTC) if data.get("archived_at") else None,
        created_by=user_id,
        updated_by=user_id,
    )
    db.add(row)
    await db.flush()
    log.info("board_column_created", column_id=str(row_id), board_id=str(board.id))
    return Outcome(version=row.version)


async def _row(db: AsyncSession, user_id: uuid.UUID, row_id: uuid.UUID) -> BoardColumn:
    row = await db.get(BoardColumn, row_id)
    if row is None:  # unknown or not readable under row-level security
        raise _not_found()
    await _writable(db, user_id, row.board_id)
    return row


async def update_column(
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
    apply, conflicts = merge(state_of(row), _archived_flag(base), _archived_flag(new))
    for name, value in apply.items():
        if name == "name":
            row.name = checked_name(value)
        elif name == "position":
            row.position = checked_position(value)
        elif name == "wip_limit":
            row.wip_limit = checked_wip_limit(value)
        else:
            row.archived_at = datetime.now(UTC) if value else None
    if apply:
        row.version += 1
        row.updated_by = user_id
        await db.flush()
    log.info("board_column_updated", column_id=str(row_id), fields=sorted(apply), conflicts=conflicts)
    return Outcome(version=row.version, conflicts=conflicts)


async def delete_column(
    db: AsyncSession, user_id: uuid.UUID, row_id: uuid.UUID, base_version: int | None = None
) -> Outcome:
    row = await _row(db, user_id, row_id)
    edited = row.deleted_at is None and base_version is not None and row.version != base_version
    if row.deleted_at is None:
        batch, now = new_batch(), datetime.now(UTC)
        cards = select(Card.id).where(Card.column_id == row_id).scalar_subquery()
        changes = {"deleted_at": now, "delete_batch_id": batch, "updated_by": user_id}
        await db.execute(
            update(Item)
            .where(Item.id.in_(cards), Item.deleted_at.is_(None))
            .values(**changes, version=Item.version + 1)
            .execution_options(synchronize_session=False)
        )
        for model in (Attachment, ChecklistItem, ItemLabel):
            await db.execute(
                update(model)
                .where(model.item_id.in_(cards), model.deleted_at.is_(None))
                .values(**changes, version=model.version + 1)
                .execution_options(synchronize_session=False)
            )
        row.deleted_at, row.delete_batch_id, row.updated_by = now, batch, user_id
        row.version += 1
        await db.flush()
        log.info("board_column_deleted", column_id=str(row_id), batch_id=str(batch), user_id=str(user_id))
    return Outcome(version=row.version, edited_elsewhere=edited)


async def restore_column(db: AsyncSession, user_id: uuid.UUID, row_id: uuid.UUID) -> Outcome:
    row = await _row(db, user_id, row_id)
    if row.deleted_at is not None and row.delete_batch_id is not None:
        await restore_batch(
            db, [BoardColumn, Item, Attachment, ChecklistItem, ItemLabel], row.delete_batch_id, user_id
        )
        await db.refresh(row)
    return Outcome(version=row.version)
