"""Trash HTTP endpoints (contract: api/modules/collab.yaml — trash, trash_restore).

+++===+++ 2026-10-16 — Hasan Alizada — HAAL-033.
"""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Query

from haalendar.deps import Auth, DbSession
from haalendar.trash import service
from haalendar.trash.schemas import RestoreIn, RestoreOut, TrashPageOut, TrashType

router = APIRouter(prefix="/trash", tags=["trash"])


@router.get("", operation_id="listTrash")
async def list_trash(
    auth: Auth,
    db: DbSession,
    module: Annotated[TrashType | None, Query()] = None,
    cursor: Annotated[str | None, Query(max_length=512)] = None,
    limit: Annotated[int, Query(ge=1, le=200)] = 50,
) -> TrashPageOut:
    return await service.list_trash(db, auth.user.id, module=module, cursor=cursor, limit=limit)


@router.post("/restore", operation_id="restoreFromTrash")
async def restore_from_trash(body: RestoreIn, auth: Auth, db: DbSession) -> RestoreOut:
    return await service.restore(db, auth.user.id, body.entries)
