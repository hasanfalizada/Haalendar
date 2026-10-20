"""Request and response models of the notification endpoints (contract: api/modules/collab.yaml — notifications).

+++===+++ 2026-10-19 — Hasan Alizada — HAAL-048.
"""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, Field, model_validator

from haalendar.security.schemas import ApiModel

Kind = Literal[
    "reminder", "share_received", "share_revoked", "sync_error", "assigned", "comment", "export_ready"
]


class NotificationOut(BaseModel):
    id: uuid.UUID
    kind: Kind
    item_id: uuid.UUID | None = None
    payload: dict[str, Any]
    created_at: datetime
    read_at: datetime | None = None


class NotificationPageOut(BaseModel):
    data: list[NotificationOut]
    unread_count: int
    next_cursor: str | None


class MarkReadIn(ApiModel):
    ids: list[uuid.UUID] | None = Field(default=None, max_length=500)
    all: bool | None = None

    @model_validator(mode="after")
    def one_of(self) -> MarkReadIn:
        if not self.ids and not self.all:
            raise ValueError("send ids or all: true")
        return self
