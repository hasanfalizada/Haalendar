"""Links between items (FR-INT-01, owner decision D-98).

+++===+++ 2026-10-30 — Hasan Alizada — HAAL-120. Written through sync:
- create: two different live items (event, note, card) the user reads, at least one of them in a container the user
  may write (owner or edit share, not archived); the same pair in either order once (409); at most MAX_PER_ITEM live
  links per item (422). The containers of both ends are copied into the row (row-level security reads either);
- delete and restore: by whoever may write either end (restore refused while the pair is linked again); an item's
  delete leaves its links alone — the client shows them with the item in the trash.
- move: an event moved to another calendar takes its links' containers along (haalendar.planning.service.move_item).
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime
from typing import Any, cast

from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from haalendar.atoms.authz.check import check
from haalendar.authz import container_access
from haalendar.errors import ProblemCode, ProblemError
from haalendar.logging import get_logger
from haalendar.planning.models import Item, Link
from haalendar.planning.service import Outcome
from haalendar.security.rls import ContainerKind
from haalendar.softdelete import new_batch, restore_batch

log = get_logger(__name__)

MAX_PER_ITEM = 50
KINDS = ("event", "note", "card")


def _not_found() -> ProblemError:
    return ProblemError(404, ProblemCode.NOT_FOUND, "Not found")


async def _may_write(db: AsyncSession, user_id: uuid.UUID, kind: str, container_id: uuid.UUID) -> bool:
    access = await container_access(db, cast(ContainerKind, kind), container_id)
    if access is None or access.archived:
        return False
    return check(user_id, "write_items", access.owner_id, access.share_permission).allowed


async def _require_one_writable(
    db: AsyncSession, user_id: uuid.UUID, ends: list[tuple[str, uuid.UUID]]
) -> None:
    for kind, container_id in ends:
        if await _may_write(db, user_id, kind, container_id):
            return
    raise ProblemError(403, ProblemCode.FORBIDDEN, "You may change neither of the linked items")


async def _live_pair(db: AsyncSession, a: uuid.UUID, b: uuid.UUID, own_id: uuid.UUID) -> None:
    taken = await db.scalar(
        select(Link.id).where(
            or_(
                (Link.from_item_id == a) & (Link.to_item_id == b),
                (Link.from_item_id == b) & (Link.to_item_id == a),
            ),
            Link.deleted_at.is_(None),
            Link.id != own_id,
        )
    )
    if taken is not None:
        raise ProblemError(409, ProblemCode.DUPLICATE, "These items are linked already")


async def _count(db: AsyncSession, item_id: uuid.UUID) -> int:
    found = await db.scalar(
        select(func.count())
        .select_from(Link)
        .where(or_(Link.from_item_id == item_id, Link.to_item_id == item_id), Link.deleted_at.is_(None))
    )
    return int(found or 0)


async def create_link(
    db: AsyncSession, user_id: uuid.UUID, row_id: uuid.UUID, data: dict[str, Any]
) -> Outcome:
    if await db.get(Link, row_id) is not None:
        raise ProblemError(409, ProblemCode.DUPLICATE, "A link with this id exists")
    first = await db.get(Item, data["from_item_id"])
    second = await db.get(Item, data["to_item_id"])
    if first is None or second is None:  # unknown or not readable
        raise _not_found()
    if first.id == second.id:
        raise ProblemError(422, ProblemCode.VALIDATION_FAILED, "An item cannot be linked to itself")
    if first.kind not in KINDS or second.kind not in KINDS:
        raise ProblemError(422, ProblemCode.VALIDATION_FAILED, "Only events, notes and cards are linked")
    for item in (first, second):
        if await container_access(db, cast(ContainerKind, item.container_kind), item.container_id) is None:
            raise _not_found()
    await _require_one_writable(
        db,
        user_id,
        [(first.container_kind, first.container_id), (second.container_kind, second.container_id)],
    )
    if first.deleted_at is not None or second.deleted_at is not None:
        raise ProblemError(409, ProblemCode.INVALID_STATE, "It was deleted on another device")
    await _live_pair(db, first.id, second.id, row_id)
    for item in (first, second):
        if await _count(db, item.id) >= MAX_PER_ITEM:
            raise ProblemError(422, ProblemCode.VALIDATION_FAILED, f"At most {MAX_PER_ITEM} links per item")
    row = Link(
        id=row_id,
        from_item_id=first.id,
        to_item_id=second.id,
        container_kind=first.container_kind,
        container_id=first.container_id,
        to_container_kind=second.container_kind,
        to_container_id=second.container_id,
        origin=data.get("origin") or "manual",
        created_by=user_id,
        updated_by=user_id,
    )
    db.add(row)
    await db.flush()
    log.info("link_created", link_id=str(row_id), from_item_id=str(first.id), to_item_id=str(second.id))
    return Outcome(version=row.version)


async def _row(db: AsyncSession, user_id: uuid.UUID, row_id: uuid.UUID) -> Link:
    row = await db.get(Link, row_id)
    if row is None:
        raise _not_found()
    await _require_one_writable(
        db, user_id, [(row.container_kind, row.container_id), (row.to_container_kind, row.to_container_id)]
    )
    return row


async def delete_link(db: AsyncSession, user_id: uuid.UUID, row_id: uuid.UUID) -> Outcome:
    row = await _row(db, user_id, row_id)
    if row.deleted_at is None:
        row.deleted_at, row.delete_batch_id, row.updated_by = datetime.now(UTC), new_batch(), user_id
        row.version += 1
        await db.flush()
        log.info("link_deleted", link_id=str(row_id), user_id=str(user_id))
    return Outcome(version=row.version)


async def restore_link(db: AsyncSession, user_id: uuid.UUID, row_id: uuid.UUID) -> Outcome:
    row = await _row(db, user_id, row_id)
    if row.deleted_at is not None and row.delete_batch_id is not None:
        await _live_pair(db, row.from_item_id, row.to_item_id, row.id)
        await restore_batch(db, [Link], row.delete_batch_id, user_id)
        await db.refresh(row)
    return Outcome(version=row.version)
