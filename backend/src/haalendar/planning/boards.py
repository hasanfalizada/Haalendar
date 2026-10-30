"""Kanban boards (FR-KAN-01, domain model 5.3, owner decision D-90).

+++===+++ 2026-10-29 — Hasan Alizada — HAAL-110. Written through sync like calendars (D-82), by the owner only:
- create: name 1-100 (trimmed, not blank), position required (fractional index of letters and digits — the owner's
  board order; a new board goes to the end);
- update: field-level merge of name, position and archived_at (any timestamp archives — the server keeps its own
  time —, null unarchives; merged as archived or not). An archived board is read-only for everyone (haalendar.authz);
  renaming, unarchiving and deleting it stay possible;
- delete: soft, the board with everything in it in one batch (its cards, their attachments and checklist items —
  columns join with HAAL-111); restore brings the batch back. Repeating either is harmless.
+++===+++ 2026-10-29 — Hasan Alizada — HAAL-111. The board's columns go to the trash and come back with it.
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime
from typing import Any

from sqlalchemy import update
from sqlalchemy.ext.asyncio import AsyncSession

from haalendar.attachments.models import Attachment
from haalendar.errors import ProblemCode, ProblemError
from haalendar.logging import get_logger
from haalendar.planning.models import Board, BoardColumn, CardAssignee, ChecklistItem, Item, ItemLabel, Label
from haalendar.planning.notes import checked_position
from haalendar.planning.service import Outcome, merge
from haalendar.softdelete import new_batch, restore_batch

log = get_logger(__name__)

NAME_MAX = 100
# The rows that live in a board and go to the trash with it.
# +++===+++ 2026-10-29 — Hasan Alizada — HAAL-112. Its labels and the labels on its cards too.
# +++===+++ 2026-10-30 — Hasan Alizada — HAAL-119. And the cards' assignees.
CONTENTS: tuple[type[Any], ...] = (
    BoardColumn,
    Item,
    Attachment,
    ChecklistItem,
    Label,
    ItemLabel,
    CardAssignee,
)


def _problem(field: str, message: str) -> ProblemError:
    return ProblemError(
        422, ProblemCode.VALIDATION_FAILED, "Invalid board", errors=[{"field": field, "message": message}]
    )


def checked_name(value: Any) -> str:
    if not isinstance(value, str) or not value.strip():
        raise _problem("name", "Enter a name")
    if len(value.strip()) > NAME_MAX:
        raise _problem("name", f"At most {NAME_MAX} characters")
    return value.strip()


async def _board(db: AsyncSession, board_id: uuid.UUID) -> Board:
    board = await db.get(Board, board_id)
    if board is None:  # unknown or not readable under row-level security
        raise ProblemError(404, ProblemCode.NOT_FOUND, "Not found")
    return board


def _owner_only(board: Board, user_id: uuid.UUID) -> None:
    if board.owner_id != user_id:
        raise ProblemError(403, ProblemCode.FORBIDDEN, "Only the owner can change this board")


def _fields(board: Board) -> dict[str, Any]:
    # The archive state merges as archived or not: the client sends its own time, the server keeps its own.
    return {"name": board.name, "position": board.position, "archived_at": board.archived_at is not None}


def _archived_flag(values: dict[str, Any]) -> dict[str, Any]:
    return {**values, "archived_at": values["archived_at"] is not None} if "archived_at" in values else values


async def create_board(
    db: AsyncSession, user_id: uuid.UUID, board_id: uuid.UUID, data: dict[str, Any]
) -> Outcome:
    if await db.get(Board, board_id) is not None:
        raise ProblemError(409, ProblemCode.DUPLICATE, "A board with this id exists")
    board = Board(
        id=board_id,
        owner_id=user_id,
        name=checked_name(data.get("name")),
        position=checked_position(data.get("position")),
        archived_at=datetime.now(UTC) if data.get("archived_at") else None,
        created_by=user_id,
        updated_by=user_id,
    )
    db.add(board)
    await db.flush()
    log.info("board_created", board_id=str(board_id), user_id=str(user_id))
    return Outcome(version=board.version)


async def update_board(
    db: AsyncSession,
    user_id: uuid.UUID,
    board_id: uuid.UUID,
    base: dict[str, Any],
    new: dict[str, Any],
    current_state: dict[str, Any],
) -> Outcome:
    board = await _board(db, board_id)
    _owner_only(board, user_id)
    if board.deleted_at is not None:
        raise ProblemError(
            409, ProblemCode.INVALID_STATE, "It was deleted on another device", current=current_state
        )
    apply, conflicts = merge(_fields(board), _archived_flag(base), _archived_flag(new))
    for name, value in apply.items():
        if name == "archived_at":
            board.archived_at = datetime.now(UTC) if value else None
        elif name == "name":
            board.name = checked_name(value)
        else:
            board.position = checked_position(value)
    if apply:
        board.version += 1
        board.updated_by = user_id
        await db.flush()
    log.info("board_updated", board_id=str(board_id), fields=sorted(apply), conflicts=conflicts)
    return Outcome(version=board.version, conflicts=conflicts)


async def delete_board(
    db: AsyncSession, user_id: uuid.UUID, board_id: uuid.UUID, base_version: int | None = None
) -> Outcome:
    board = await _board(db, board_id)
    _owner_only(board, user_id)
    edited = board.deleted_at is None and base_version is not None and board.version != base_version
    if board.deleted_at is None:
        batch = new_batch()
        now = datetime.now(UTC)
        changes = {"deleted_at": now, "delete_batch_id": batch, "updated_by": user_id}
        for model in CONTENTS:
            await db.execute(
                update(model)
                .where(
                    model.container_kind == "board",
                    model.container_id == board_id,
                    model.deleted_at.is_(None),
                )
                .values(**changes, version=model.version + 1)
                .execution_options(synchronize_session=False)
            )
        board.deleted_at, board.delete_batch_id, board.updated_by = now, batch, user_id
        board.version += 1
        await db.flush()
        log.info("board_deleted", board_id=str(board_id), batch_id=str(batch), user_id=str(user_id))
    return Outcome(version=board.version, edited_elsewhere=edited)


async def restore_board(db: AsyncSession, user_id: uuid.UUID, board_id: uuid.UUID) -> Outcome:
    board = await _board(db, board_id)
    _owner_only(board, user_id)
    if board.deleted_at is not None and board.delete_batch_id is not None:
        await restore_batch(db, [Board, *CONTENTS], board.delete_batch_id, user_id)
        await db.refresh(board)
    return Outcome(version=board.version)
