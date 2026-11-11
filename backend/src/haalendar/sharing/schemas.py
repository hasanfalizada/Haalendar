"""Request and response models of the sharing endpoints (contract: api/modules/collab.yaml — shares, share).

+++===+++ 2026-10-15 — Hasan Alizada — HAAL-167.
"""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, EmailStr, Field

from haalendar.security.schemas import ApiModel

ContainerKindIn = Literal["calendar", "board", "note"]
Permission = Literal["view", "edit"]


class ShareCreateIn(ApiModel):
    container_kind: ContainerKindIn
    container_id: uuid.UUID
    grantee_email: EmailStr = Field(max_length=254)
    permission: Permission


class SharePatchIn(ApiModel):
    permission: Permission


class ShareOut(BaseModel):
    id: uuid.UUID
    container_kind: ContainerKindIn
    container_id: uuid.UUID
    container_name: str
    grantee_id: uuid.UUID
    grantee_name: str
    grantee_email: str
    owner_id: uuid.UUID
    owner_name: str
    permission: Permission
    granted_by: uuid.UUID
    created_at: datetime
    revoked_at: datetime | None
    version: int


class ShareListOut(BaseModel):
    data: list[ShareOut]
