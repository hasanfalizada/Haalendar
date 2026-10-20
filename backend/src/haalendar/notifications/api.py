"""Notification HTTP endpoints (contract: api/modules/collab.yaml — notifications, notifications_read).

+++===+++ 2026-10-19 — Hasan Alizada — HAAL-048. The list carries the unread count for the badge; marking read takes
ids or all (204, as in the contract; the client reloads the list).
"""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Query, status

from haalendar.deps import Auth, DbSession
from haalendar.notifications import service
from haalendar.notifications.schemas import MarkReadIn, NotificationPageOut

router = APIRouter(prefix="/notifications", tags=["notifications"])


@router.get("", operation_id="listNotifications")
async def list_notifications(
    auth: Auth,
    db: DbSession,
    unread: bool = False,
    cursor: str | None = None,
    limit: Annotated[int, Query(ge=1, le=200)] = 50,
) -> NotificationPageOut:
    page = await service.list_notifications(db, auth.user.id, unread_only=unread, cursor=cursor, limit=limit)
    return NotificationPageOut(
        data=[service.to_out(row) for row in page.rows],
        unread_count=page.unread_count,
        next_cursor=page.next_cursor,
    )


@router.post("/read", status_code=status.HTTP_204_NO_CONTENT, operation_id="markNotificationsRead")
async def mark_read(body: MarkReadIn, auth: Auth, db: DbSession) -> None:
    await service.mark_read(db, auth.user.id, ids=body.ids, all_=bool(body.all))
