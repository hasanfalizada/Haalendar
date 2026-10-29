"""Board labels and labels on cards (FR-KAN-03, domain model 5.11, owner decision D-92).

+++===+++ 2026-10-29 — Hasan Alizada — HAAL-112. Written through sync by the board's owner or an edit share (not on an
archived board — haalendar.authz):
- a label of a board: name 1-40 (trimmed, not blank, unique on the board among live labels, case ignored — 409
  otherwise), colour of the palette; name and colour merge field by field; delete is soft and takes the label off every
  item in the same batch; restore brings the batch back;
- a label on an item: a row of its own (a set synced as add / remove, ADR-0009) for a live card of the label's board;
  the same label twice on one item is refused (409); removing is a soft delete, restore puts it back (refused while
  the label is in the trash).
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime
from typing import Any

from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from haalendar.authz import require
from haalendar.errors import ProblemCode, ProblemError
from haalendar.logging import get_logger
from haalendar.planning.models import COLORS, Board, Item, ItemLabel, Label
from haalendar.planning.service import Outcome, merge
from haalendar.softdelete import new_batch, restore_batch

log = get_logger(__name__)

NAME_MAX = 40


def _problem(field: str, message: str) -> ProblemError:
    return ProblemError(
        422, ProblemCode.VALIDATION_FAILED, "Invalid label", errors=[{"field": field, "message": message}]
    )


def _not_found() -> ProblemError:
    return ProblemError(404, ProblemCode.NOT_FOUND, "Not found")


def checked_name(value: Any) -> str:
    if not isinstance(value, str) or not value.strip():
        raise _problem("name", "Enter a name")
    if len(value.strip()) > NAME_MAX:
        raise _problem("name", f"At most {NAME_MAX} characters")
    return value.strip()


def checked_color(value: Any) -> str:
    if value not in COLORS:
        raise _problem("color", "Choose a colour of the palette")
    return str(value)


async def _writable(db: AsyncSession, user_id: uuid.UUID, board_id: uuid.UUID) -> None:
    await require(db, user_id, "write_items", "board", board_id)


async def _name_free(db: AsyncSession, board_id: uuid.UUID, name: str, own_id: uuid.UUID) -> None:
    taken = await db.scalar(
        select(Label.id).where(
            Label.board_id == board_id,
            func.lower(Label.name) == name.lower(),
            Label.deleted_at.is_(None),
            Label.id != own_id,
        )
    )
    if taken is not None:
        raise ProblemError(409, ProblemCode.DUPLICATE, "This board already has a label with this name")


async def create_label(
    db: AsyncSession, user_id: uuid.UUID, row_id: uuid.UUID, data: dict[str, Any]
) -> Outcome:
    if await db.get(Label, row_id) is not None:
        raise ProblemError(409, ProblemCode.DUPLICATE, "A label with this id exists")
    board = await db.get(Board, data["board_id"])
    if board is None:
        raise _not_found()
    await _writable(db, user_id, board.id)
    name = checked_name(data.get("name"))
    await _name_free(db, board.id, name, row_id)
    row = Label(
        id=row_id,
        board_id=board.id,
        container_kind="board",
        container_id=board.id,
        name=name,
        color=checked_color(data.get("color") or "blue"),
        created_by=user_id,
        updated_by=user_id,
    )
    db.add(row)
    await db.flush()
    log.info("label_created", label_id=str(row_id), board_id=str(board.id))
    return Outcome(version=row.version)


async def _label(db: AsyncSession, user_id: uuid.UUID, row_id: uuid.UUID) -> Label:
    row = await db.get(Label, row_id)
    if row is None:  # unknown or not readable under row-level security
        raise _not_found()
    await _writable(db, user_id, row.board_id)
    return row


async def update_label(
    db: AsyncSession,
    user_id: uuid.UUID,
    row_id: uuid.UUID,
    base: dict[str, Any],
    new: dict[str, Any],
    current_state: dict[str, Any],
) -> Outcome:
    row = await _label(db, user_id, row_id)
    if row.deleted_at is not None:
        raise ProblemError(
            409, ProblemCode.INVALID_STATE, "It was deleted on another device", current=current_state
        )
    apply, conflicts = merge({"name": row.name, "color": row.color}, base, new)
    if "name" in apply:
        row.name = checked_name(apply["name"])
        await _name_free(db, row.board_id, row.name, row.id)
    if "color" in apply:
        row.color = checked_color(apply["color"])
    if apply:
        row.version += 1
        row.updated_by = user_id
        await db.flush()
    log.info("label_updated", label_id=str(row_id), fields=sorted(apply), conflicts=conflicts)
    return Outcome(version=row.version, conflicts=conflicts)


async def delete_label(
    db: AsyncSession, user_id: uuid.UUID, row_id: uuid.UUID, base_version: int | None = None
) -> Outcome:
    row = await _label(db, user_id, row_id)
    edited = row.deleted_at is None and base_version is not None and row.version != base_version
    if row.deleted_at is None:
        batch, now = new_batch(), datetime.now(UTC)
        await db.execute(
            update(ItemLabel)
            .where(ItemLabel.label_id == row_id, ItemLabel.deleted_at.is_(None))
            .values(deleted_at=now, delete_batch_id=batch, updated_by=user_id, version=ItemLabel.version + 1)
            .execution_options(synchronize_session=False)
        )
        row.deleted_at, row.delete_batch_id, row.updated_by = now, batch, user_id
        row.version += 1
        await db.flush()
        log.info("label_deleted", label_id=str(row_id), batch_id=str(batch), user_id=str(user_id))
    return Outcome(version=row.version, edited_elsewhere=edited)


async def restore_label(db: AsyncSession, user_id: uuid.UUID, row_id: uuid.UUID) -> Outcome:
    row = await _label(db, user_id, row_id)
    if row.deleted_at is not None and row.delete_batch_id is not None:
        await _name_free(db, row.board_id, row.name, row.id)
        await restore_batch(db, [Label, ItemLabel], row.delete_batch_id, user_id)
        await db.refresh(row)
    return Outcome(version=row.version)


async def _live_pair(db: AsyncSession, item_id: uuid.UUID, label_id: uuid.UUID, own_id: uuid.UUID) -> None:
    taken = await db.scalar(
        select(ItemLabel.id).where(
            ItemLabel.item_id == item_id,
            ItemLabel.label_id == label_id,
            ItemLabel.deleted_at.is_(None),
            ItemLabel.id != own_id,
        )
    )
    if taken is not None:
        raise ProblemError(409, ProblemCode.DUPLICATE, "The label is already on it")


async def add_label(db: AsyncSession, user_id: uuid.UUID, row_id: uuid.UUID, data: dict[str, Any]) -> Outcome:
    if await db.get(ItemLabel, row_id) is not None:
        raise ProblemError(409, ProblemCode.DUPLICATE, "This id is already used")
    item = await db.get(Item, data["item_id"])
    label = await db.get(Label, data["label_id"])
    if item is None or label is None:
        raise _not_found()
    if item.kind != "card" or item.container_kind != "board" or item.container_id != label.board_id:
        raise ProblemError(422, ProblemCode.VALIDATION_FAILED, "A board label goes on a card of its board")
    await _writable(db, user_id, label.board_id)
    if item.deleted_at is not None or label.deleted_at is not None:
        raise ProblemError(409, ProblemCode.INVALID_STATE, "It was deleted on another device")
    await _live_pair(db, item.id, label.id, row_id)
    row = ItemLabel(
        id=row_id,
        item_id=item.id,
        label_id=label.id,
        container_kind=item.container_kind,
        container_id=item.container_id,
        created_by=user_id,
        updated_by=user_id,
    )
    db.add(row)
    await db.flush()
    log.info("item_label_added", item_label_id=str(row_id), item_id=str(item.id), label_id=str(label.id))
    return Outcome(version=row.version)


async def _item_label(db: AsyncSession, user_id: uuid.UUID, row_id: uuid.UUID) -> ItemLabel:
    row = await db.get(ItemLabel, row_id)
    if row is None:
        raise _not_found()
    await require(db, user_id, "write_items", "board", row.container_id)
    return row


async def remove_label(db: AsyncSession, user_id: uuid.UUID, row_id: uuid.UUID) -> Outcome:
    row = await _item_label(db, user_id, row_id)
    if row.deleted_at is None:
        row.deleted_at, row.delete_batch_id, row.updated_by = datetime.now(UTC), new_batch(), user_id
        row.version += 1
        await db.flush()
        log.info("item_label_removed", item_label_id=str(row_id), user_id=str(user_id))
    return Outcome(version=row.version)


async def restore_item_label(db: AsyncSession, user_id: uuid.UUID, row_id: uuid.UUID) -> Outcome:
    row = await _item_label(db, user_id, row_id)
    if row.deleted_at is not None and row.delete_batch_id is not None:
        label = await db.get(Label, row.label_id)
        if label is None or label.deleted_at is not None:
            raise ProblemError(409, ProblemCode.INVALID_STATE, "The label is in the trash")
        await _live_pair(db, row.item_id, row.label_id, row.id)
        await restore_batch(db, [ItemLabel], row.delete_batch_id, user_id)
        await db.refresh(row)
    return Outcome(version=row.version)
