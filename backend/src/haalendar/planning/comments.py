"""Card comments (FR-KAN-05, owner decision D-123).

+++===+++ 2026-11-24 17:41 +04 — Hasan Alizada — HAAL-114. Written through sync by those who write the card's board
(its owner and edit shares; not on an archived board — haalendar.authz); a view share reads them:
- create on a live card: Markdown, 1-10 000 characters with some text in them, kept as typed; the author is the
  writer;
- update: the text only, by its author only (403 otherwise); a changed text stamps `edited_at`;
- delete (soft, its own batch) and restore: by the author or by the board's owner.
A card's delete takes its comments into the same batch (planning.service), as its column's and its board's do.
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
from haalendar.planning.models import Board, Comment, Item
from haalendar.planning.service import Outcome, merge
from haalendar.softdelete import new_batch, restore_batch

log = get_logger(__name__)

BODY_MAX = 10_000
MAX_PER_CARD = 1_000


def _not_found() -> ProblemError:
    return ProblemError(404, ProblemCode.NOT_FOUND, "Not found")


def _forbidden(message: str) -> ProblemError:
    return ProblemError(403, ProblemCode.FORBIDDEN, message)


def checked_body(value: Any) -> str:
    if not isinstance(value, str) or not value.strip():
        raise ProblemError(
            422,
            ProblemCode.VALIDATION_FAILED,
            "Invalid comment",
            errors=[{"pointer": "/body", "detail": "Write something"}],
        )
    if len(value) > BODY_MAX:
        raise ProblemError(
            422,
            ProblemCode.VALIDATION_FAILED,
            "Invalid comment",
            errors=[{"pointer": "/body", "detail": f"At most {BODY_MAX} characters"}],
        )
    return value


def state_of(row: Comment) -> dict[str, Any]:
    return {"body": row.body}


async def create_comment(
    db: AsyncSession, user_id: uuid.UUID, row_id: uuid.UUID, data: dict[str, Any]
) -> Outcome:
    if await db.get(Comment, row_id) is not None:
        raise ProblemError(409, ProblemCode.DUPLICATE, "This id is already used")
    item = await db.get(Item, uuid.UUID(str(data["item_id"])))
    if item is None:  # unknown or not readable
        raise _not_found()
    if item.kind != "card" or item.container_kind != "board":
        raise ProblemError(422, ProblemCode.VALIDATION_FAILED, "Only cards have comments")
    await require(db, user_id, "write_items", "board", item.container_id)
    if item.deleted_at is not None:
        raise ProblemError(409, ProblemCode.INVALID_STATE, "It was deleted on another device")
    body = checked_body(data.get("body"))
    count = await db.scalar(
        select(func.count())
        .select_from(Comment)
        .where(Comment.item_id == item.id, Comment.deleted_at.is_(None))
    )
    if (count or 0) >= MAX_PER_CARD:
        raise ProblemError(409, ProblemCode.INVALID_STATE, f"A card holds at most {MAX_PER_CARD} comments")
    row = Comment(
        id=row_id,
        item_id=item.id,
        author_id=user_id,
        body=body,
        container_kind="board",
        container_id=item.container_id,
        created_by=user_id,
        updated_by=user_id,
    )
    db.add(row)
    await db.flush()
    log.info("comment_created", comment_id=str(row_id), item_id=str(item.id))
    return Outcome(version=row.version)


async def _row(db: AsyncSession, user_id: uuid.UUID, row_id: uuid.UUID) -> Comment:
    row = await db.get(Comment, row_id)
    if row is None:
        raise _not_found()
    await require(db, user_id, "write_items", "board", row.container_id)
    return row


async def update_comment(
    db: AsyncSession,
    user_id: uuid.UUID,
    row_id: uuid.UUID,
    base: dict[str, Any],
    new: dict[str, Any],
    current_state: dict[str, Any],
) -> Outcome:
    row = await _row(db, user_id, row_id)
    if row.author_id != user_id:
        raise _forbidden("Only its author changes a comment")
    if row.deleted_at is not None:
        raise ProblemError(
            409, ProblemCode.INVALID_STATE, "It was deleted on another device", current=current_state
        )
    apply, conflicts = merge(state_of(row), base, new)
    if "body" in apply and apply["body"] != row.body:
        row.body = checked_body(apply["body"])
        row.edited_at = datetime.now(UTC)
        row.version += 1
        row.updated_by = user_id
        await db.flush()
    log.info("comment_updated", comment_id=str(row_id), fields=sorted(apply), conflicts=conflicts)
    return Outcome(version=row.version, conflicts=conflicts)


async def _author_or_board_owner(db: AsyncSession, user_id: uuid.UUID, row: Comment) -> None:
    if row.author_id == user_id:
        return
    board = await db.get(Board, row.container_id)
    if board is None or board.owner_id != user_id:
        raise _forbidden("Only its author or the board's owner deletes a comment")


async def delete_comment(db: AsyncSession, user_id: uuid.UUID, row_id: uuid.UUID) -> Outcome:
    row = await _row(db, user_id, row_id)
    await _author_or_board_owner(db, user_id, row)
    if row.deleted_at is None:
        row.deleted_at, row.delete_batch_id, row.updated_by = datetime.now(UTC), new_batch(), user_id
        row.version += 1
        await db.flush()
        log.info("comment_deleted", comment_id=str(row_id), user_id=str(user_id))
    return Outcome(version=row.version)


async def restore_comment(db: AsyncSession, user_id: uuid.UUID, row_id: uuid.UUID) -> Outcome:
    row = await _row(db, user_id, row_id)
    await _author_or_board_owner(db, user_id, row)
    if row.deleted_at is not None and row.delete_batch_id is not None:
        card = await db.get(Item, row.item_id)
        if card is None or card.deleted_at is not None:
            raise ProblemError(409, ProblemCode.INVALID_STATE, "Its card is in the trash")
        await restore_batch(db, [Comment], row.delete_batch_id, user_id)
        await db.refresh(row)
    return Outcome(version=row.version)
