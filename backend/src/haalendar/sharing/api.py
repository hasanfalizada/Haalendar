"""Sharing HTTP endpoints (contract: api/modules/collab.yaml — shares, share).

+++===+++ 2026-10-15 — Hasan Alizada — HAAL-167.
"""

from __future__ import annotations

import uuid
from typing import Annotated, Literal

from fastapi import APIRouter, Header, Query, Response, status

from haalendar.api.preconditions import expected_version
from haalendar.deps import Auth, DbSession
from haalendar.sharing import service
from haalendar.sharing.schemas import ContainerKindIn, ShareCreateIn, ShareListOut, ShareOut, SharePatchIn

router = APIRouter(prefix="/shares", tags=["sharing"])


@router.get("", operation_id="listShares")
async def list_shares(
    auth: Auth,
    db: DbSession,
    direction: Annotated[Literal["granted", "received"], Query()] = "granted",
    container_kind: Annotated[ContainerKindIn | None, Query()] = None,
    container_id: Annotated[uuid.UUID | None, Query()] = None,
) -> ShareListOut:
    data = await service.list_shares(
        db, auth.user.id, direction=direction, container_kind=container_kind, container_id=container_id
    )
    return ShareListOut(data=data)


@router.post("", status_code=status.HTTP_201_CREATED, operation_id="createShare")
async def create_share(
    body: ShareCreateIn,
    auth: Auth,
    db: DbSession,
    idempotency_key: Annotated[uuid.UUID | None, Header()] = None,
) -> ShareOut:
    # Idempotency-Key is accepted per contract; a repeated share answers 409 duplicate (already shared).
    return await service.create_share(
        db,
        auth.user.id,
        container_kind=body.container_kind,
        container_id=body.container_id,
        grantee_email=str(body.grantee_email),
        permission=body.permission,
    )


@router.patch("/{id}", operation_id="updateShare")
async def update_share(
    id: uuid.UUID,
    body: SharePatchIn,
    response: Response,
    auth: Auth,
    db: DbSession,
    if_match: Annotated[str | None, Header()] = None,
) -> ShareOut:
    share = await service.update_share(
        db, auth.user.id, id, permission=body.permission, expected_version=expected_version(if_match)
    )
    response.headers["ETag"] = f'"{share.version}"'
    return share


@router.delete("/{id}", status_code=status.HTTP_204_NO_CONTENT, operation_id="revokeShare")
async def revoke_share(id: uuid.UUID, auth: Auth, db: DbSession) -> None:
    await service.revoke_share(db, auth.user.id, id)
