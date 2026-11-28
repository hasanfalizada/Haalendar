"""History endpoint of an item (contract: api/modules/items.yaml — item_history).

+++===+++ 2026-11-24 17:41 +04 — Hasan Alizada — HAAL-114. `GET /items/{id}/history`: the audit records of the item and
of what hangs off it, newest first, in pages (FR-X-03, D-123); 404 for an item the user does not read.
"""

from __future__ import annotations

import uuid
from typing import Annotated

from fastapi import APIRouter, Query

from haalendar.audit import service
from haalendar.audit.schemas import HistoryPageOut
from haalendar.deps import Auth, DbSession

router = APIRouter(prefix="/items", tags=["items"])


@router.get("/{id}/history", operation_id="getItemHistory")
async def item_history(
    id: uuid.UUID,
    auth: Auth,
    db: DbSession,
    cursor: Annotated[str | None, Query(max_length=512)] = None,
    limit: Annotated[int, Query(ge=1, le=200)] = 50,
) -> HistoryPageOut:
    page = await service.item_history(db, id, cursor=cursor, limit=limit)
    return HistoryPageOut(data=page.records, next_cursor=page.next_cursor)
