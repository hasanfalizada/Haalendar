"""Notification center: list (newest first, keyset), unread count, mark read, create own (FR-X-21, D-52).

+++===+++ 2026-10-19 — Hasan Alizada — HAAL-048. Everything runs under the owner-only row-level security of the
request (or of the worker acting as the user), so only the user's own rows are ever seen or changed. Notifications
for other users come from database triggers (haalendar.notifications.sql). Logged by kind and count, never payload.
"""

from __future__ import annotations

import uuid
from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Any

from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from haalendar.accounts.service import decode_cursor, encode_cursor
from haalendar.logging import get_logger
from haalendar.notifications.models import Notification
from haalendar.notifications.schemas import NotificationOut

log = get_logger(__name__)


def to_out(row: Notification) -> NotificationOut:
    return NotificationOut.model_validate(row, from_attributes=True)


@dataclass(frozen=True)
class NotificationPage:
    rows: list[Notification]
    unread_count: int
    next_cursor: str | None


async def unread_count(db: AsyncSession, owner_id: uuid.UUID) -> int:
    query = select(func.count()).where(Notification.owner_id == owner_id, Notification.read_at.is_(None))
    return int((await db.execute(query)).scalar_one())


async def list_notifications(
    db: AsyncSession, owner_id: uuid.UUID, *, unread_only: bool, cursor: str | None, limit: int
) -> NotificationPage:
    query = select(Notification).where(Notification.owner_id == owner_id)
    if unread_only:
        query = query.where(Notification.read_at.is_(None))
    if cursor:
        query = query.where(Notification.id < decode_cursor(cursor))
    rows = list((await db.execute(query.order_by(Notification.id.desc()).limit(limit + 1))).scalars())
    next_cursor = encode_cursor(rows[limit - 1].id) if len(rows) > limit else None
    return NotificationPage(
        rows=rows[:limit], unread_count=await unread_count(db, owner_id), next_cursor=next_cursor
    )


async def mark_read(db: AsyncSession, owner_id: uuid.UUID, *, ids: list[uuid.UUID] | None, all_: bool) -> int:
    """Marks the given (or all) unread notifications read; returns how many changed."""
    query = (
        update(Notification)
        .where(Notification.owner_id == owner_id, Notification.read_at.is_(None))
        .values(read_at=datetime.now(UTC))
    )
    if not all_:
        query = query.where(Notification.id.in_(ids or []))
    result = await db.execute(query.execution_options(synchronize_session=False))
    changed = getattr(result, "rowcount", 0)
    log.info("notifications_read", user_id=str(owner_id), count=changed, all=all_)
    return int(changed)


async def notify_self(
    db: AsyncSession, owner_id: uuid.UUID, kind: str, payload: dict[str, Any]
) -> Notification:
    """A notification for the acting user (e.g. their export is ready); others' come from database triggers."""
    row = Notification(owner_id=owner_id, kind=kind, payload=payload)
    db.add(row)
    await db.flush()
    log.info("notification_created", user_id=str(owner_id), kind=kind)
    return row
