"""Card assignees (FR-KAN-10, owner decision D-97).

+++===+++ 2026-10-30 — Hasan Alizada — HAAL-119. Written through sync by the board's owner or an edit share (not on an
archived board — haalendar.authz):
- an assignee is a member of the card's board (its owner or someone with an active share, view or edit —
  `haalendar_board_members`); a row of its own for a live card, at most MAX_PER_CARD live ones per card, the same
  person twice is refused (409); someone who is not (or no longer) a member is refused (422);
- removing is a soft delete; restore puts it back (refused while the person is no longer a member or is on the card
  again). Someone whose share was revoked keeps their rows, unshown (the client shows members only) and back if
  shared again.
- The members of a board with their names and permission, for whoever reads the board.
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime
from typing import Any

from sqlalchemy import func, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from haalendar.accounts.models import UserAccount
from haalendar.authz import require
from haalendar.errors import ProblemCode, ProblemError
from haalendar.logging import get_logger
from haalendar.planning.models import CardAssignee, Item
from haalendar.planning.service import Outcome
from haalendar.softdelete import new_batch, restore_batch

log = get_logger(__name__)

MAX_PER_CARD = 20
MEMBERS = text("SELECT user_id, permission FROM haalendar_board_members(:board)")


def _not_found() -> ProblemError:
    return ProblemError(404, ProblemCode.NOT_FOUND, "Not found")


async def member_permissions(db: AsyncSession, board_id: uuid.UUID) -> dict[uuid.UUID, str]:
    """The board's members and their permission (owner, edit, view); empty when the user does not read the board."""
    rows = (await db.execute(MEMBERS, {"board": board_id})).all()
    return {row.user_id: row.permission for row in rows}


async def members(db: AsyncSession, board_id: uuid.UUID) -> list[dict[str, Any]]:
    """The members with their names: the owner first, then by name (404 for a board the user does not read)."""
    found = await member_permissions(db, board_id)
    if not found:
        raise _not_found()
    names = {
        row.id: row.display_name
        for row in (await db.execute(select(UserAccount).where(UserAccount.id.in_(found)))).scalars()
    }
    listed = [
        {"user_id": user_id, "display_name": names.get(user_id) or "", "permission": permission}
        for user_id, permission in found.items()
    ]
    return sorted(listed, key=lambda m: (m["permission"] != "owner", str(m["display_name"]).casefold()))


async def _checked_member(db: AsyncSession, board_id: uuid.UUID, user_id: uuid.UUID) -> None:
    if user_id not in await member_permissions(db, board_id):
        raise ProblemError(
            422,
            ProblemCode.VALIDATION_FAILED,
            "Only members of the board can be assigned",
            errors=[{"pointer": "/user_id", "detail": "Not a member of this board"}],
        )


async def _live_pair(db: AsyncSession, item_id: uuid.UUID, user_id: uuid.UUID, own_id: uuid.UUID) -> None:
    taken = await db.scalar(
        select(CardAssignee.id).where(
            CardAssignee.item_id == item_id,
            CardAssignee.user_id == user_id,
            CardAssignee.deleted_at.is_(None),
            CardAssignee.id != own_id,
        )
    )
    if taken is not None:
        raise ProblemError(409, ProblemCode.DUPLICATE, "This person is already assigned")


async def assign(db: AsyncSession, actor: uuid.UUID, row_id: uuid.UUID, data: dict[str, Any]) -> Outcome:
    if await db.get(CardAssignee, row_id) is not None:
        raise ProblemError(409, ProblemCode.DUPLICATE, "This id is already used")
    item = await db.get(Item, data["item_id"])
    if item is None:  # unknown or not readable
        raise _not_found()
    if item.kind != "card" or item.container_kind != "board":
        raise ProblemError(422, ProblemCode.VALIDATION_FAILED, "Only cards have assignees")
    await require(db, actor, "write_items", "board", item.container_id)
    if item.deleted_at is not None:
        raise ProblemError(409, ProblemCode.INVALID_STATE, "It was deleted on another device")
    user_id = uuid.UUID(str(data["user_id"]))
    await _checked_member(db, item.container_id, user_id)
    await _live_pair(db, item.id, user_id, row_id)
    count = await db.scalar(
        select(func.count())
        .select_from(CardAssignee)
        .where(CardAssignee.item_id == item.id, CardAssignee.deleted_at.is_(None))
    )
    if (count or 0) >= MAX_PER_CARD:
        raise ProblemError(422, ProblemCode.VALIDATION_FAILED, f"At most {MAX_PER_CARD} assignees per card")
    row = CardAssignee(
        id=row_id,
        item_id=item.id,
        user_id=user_id,
        container_kind="board",
        container_id=item.container_id,
        created_by=actor,
        updated_by=actor,
    )
    db.add(row)
    await db.flush()
    log.info("card_assigned", card_assignee_id=str(row_id), item_id=str(item.id), user_id=str(user_id))
    return Outcome(version=row.version)


async def _row(db: AsyncSession, actor: uuid.UUID, row_id: uuid.UUID) -> CardAssignee:
    row = await db.get(CardAssignee, row_id)
    if row is None:
        raise _not_found()
    await require(db, actor, "write_items", "board", row.container_id)
    return row


async def unassign(db: AsyncSession, actor: uuid.UUID, row_id: uuid.UUID) -> Outcome:
    row = await _row(db, actor, row_id)
    if row.deleted_at is None:
        row.deleted_at, row.delete_batch_id, row.updated_by = datetime.now(UTC), new_batch(), actor
        row.version += 1
        await db.flush()
        log.info("card_unassigned", card_assignee_id=str(row_id), user_id=str(actor))
    return Outcome(version=row.version)


async def restore_assignment(db: AsyncSession, actor: uuid.UUID, row_id: uuid.UUID) -> Outcome:
    row = await _row(db, actor, row_id)
    if row.deleted_at is not None and row.delete_batch_id is not None:
        await _checked_member(db, row.container_id, row.user_id)
        await _live_pair(db, row.item_id, row.user_id, row.id)
        await restore_batch(db, [CardAssignee], row.delete_batch_id, actor)
        await db.refresh(row)
    return Outcome(version=row.version)
