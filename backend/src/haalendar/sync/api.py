"""Sync HTTP endpoints (contract: api/modules/sync.yaml — sync_pull, sync_push).

+++===+++ 2026-10-21 — Hasan Alizada — HAAL-053. Both run in the request transaction of the signed-in user, so
row-level security decides what is seen and changed; push is a normal unsafe request (CSRF token required).
"""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Query

from haalendar.deps import Auth, DbSession
from haalendar.sync import push as push_service
from haalendar.sync.pull import pull as pull_changes
from haalendar.sync.schemas import ChangeOut, PullOut, PushIn, PushOut

router = APIRouter(prefix="/sync", tags=["sync"])


@router.get("/pull", operation_id="syncPull", response_model_exclude_none=True)
async def sync_pull(
    auth: Auth,
    db: DbSession,
    since: Annotated[str | None, Query(max_length=4096)] = None,
    limit: Annotated[int, Query(ge=1, le=1000)] = 500,
) -> PullOut:
    result = await pull_changes(db, auth.user.id, since, limit)
    return PullOut(
        changes=[
            ChangeOut(
                entity_type=c.entity_type, entity_id=c.entity_id, op=c.op, version=c.version, data=c.data
            )
            for c in result.changes
        ],
        cursor=result.cursor,
        has_more=result.has_more,
    )


@router.post("/push", operation_id="syncPush", response_model_exclude_none=True)
async def sync_push(body: PushIn, auth: Auth, db: DbSession) -> PushOut:
    results = await push_service.push(db, auth.user.id, list(body.mutations))
    return PushOut.model_validate({"results": results})
