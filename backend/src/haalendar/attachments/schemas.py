"""Response models of the attachment endpoints (contract: api/modules/items.yaml — Attachment, DeleteResult).

+++===+++ 2026-10-17 — Hasan Alizada — HAAL-040.
"""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel

MediaType = Literal["image/png", "image/jpeg", "image/webp", "image/gif"]


class AttachmentOut(BaseModel):
    id: uuid.UUID
    item_id: uuid.UUID
    file_name: str
    media_type: MediaType
    size_bytes: int
    width: int | None = None
    height: int | None = None
    content_hash: str
    url: str
    thumbnail_url: str
    created_at: datetime
    updated_at: datetime
    created_by: uuid.UUID | None = None
    updated_by: uuid.UUID | None = None
    deleted_at: datetime | None = None
    delete_batch_id: uuid.UUID | None = None
    version: int


class AttachmentListOut(BaseModel):
    data: list[AttachmentOut]


class DeleteResultOut(BaseModel):
    id: uuid.UUID
    deleted_at: datetime
    delete_batch_id: uuid.UUID
