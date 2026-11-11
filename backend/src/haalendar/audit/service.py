"""History of a record from the audit log, newest first (FR-X-03).

+++===+++ 2026-10-16 — Hasan Alizada — HAAL-032. Runs in the request transaction, so row-level security limits it to
records the user may read (content of readable containers; own account; admins: accounts). Endpoints use it as items
arrive (events: HAAL-063, calendars: HAAL-094). Keyset pagination on the time-ordered UUIDv7 id.
"""

from __future__ import annotations

import base64
import uuid
from dataclasses import dataclass

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from haalendar.accounts.models import UserAccount
from haalendar.audit.models import AuditLog
from haalendar.audit.schemas import AuditRecordOut
from haalendar.errors import ProblemCode, ProblemError


def _encode(last_id: uuid.UUID) -> str:
    return base64.urlsafe_b64encode(last_id.bytes).decode().rstrip("=")


def _decode(cursor: str) -> uuid.UUID:
    try:
        return uuid.UUID(bytes=base64.urlsafe_b64decode(cursor + "=" * (-len(cursor) % 4)))
    except ValueError:
        raise ProblemError(400, ProblemCode.BAD_REQUEST, "Invalid cursor") from None


@dataclass(frozen=True, slots=True)
class HistoryPage:
    records: list[AuditRecordOut]
    next_cursor: str | None


async def history(
    db: AsyncSession, entity_type: str, entity_id: uuid.UUID, *, cursor: str | None = None, limit: int = 50
) -> HistoryPage:
    statement = (
        select(AuditLog, UserAccount.display_name)
        .outerjoin(UserAccount, UserAccount.id == AuditLog.actor_id)
        .where(AuditLog.entity_type == entity_type, AuditLog.entity_id == entity_id)
        .order_by(AuditLog.id.desc())
        .limit(limit + 1)
    )
    if cursor:
        statement = statement.where(AuditLog.id < _decode(cursor))
    rows = (await db.execute(statement)).all()
    records = [
        AuditRecordOut(
            id=entry.id,
            occurred_at=entry.occurred_at,
            actor_id=entry.actor_id,
            actor_name=name,
            action=entry.action,
            entity_type=entry.entity_type,
            entity_id=entry.entity_id,
            before=entry.before,
            after=entry.after,
        )
        for entry, name in rows[:limit]
    ]
    next_cursor = _encode(rows[limit - 1][0].id) if len(rows) > limit else None
    return HistoryPage(records=records, next_cursor=next_cursor)
