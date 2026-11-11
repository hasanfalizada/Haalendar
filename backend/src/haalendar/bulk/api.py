"""Bulk HTTP endpoint (contract: api/modules/collab.yaml — bulk).

+++===+++ 2026-10-16 — Hasan Alizada — HAAL-036.
"""

from __future__ import annotations

import uuid
from typing import Annotated

from fastapi import APIRouter, Header

from haalendar.bulk import service
from haalendar.bulk.schemas import BulkIn, BulkOut
from haalendar.deps import Auth, DbSession

router = APIRouter(prefix="/bulk", tags=["bulk"])


@router.post("", operation_id="bulkOperation")
async def bulk_operation(
    body: BulkIn,
    auth: Auth,
    db: DbSession,
    idempotency_key: Annotated[uuid.UUID | None, Header()] = None,
) -> BulkOut:
    # Idempotency-Key is accepted per contract; a repeated request after success fails with version_conflict
    # because every changed row has a new version, so it is never applied twice.
    return await service.apply(db, auth.user.id, body)
