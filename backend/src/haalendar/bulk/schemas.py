"""Request and response models of the bulk endpoint (contract: api/modules/collab.yaml — bulk).

+++===+++ 2026-10-16 — Hasan Alizada — HAAL-036.
"""

from __future__ import annotations

import uuid
from datetime import date
from typing import Literal

from pydantic import BaseModel, Field

from haalendar.security.schemas import ApiModel

BulkType = Literal["event", "note", "card", "calendar"]
BulkAction = Literal["delete", "restore", "set_color", "set_priority", "move_next_day"]
Color = Literal["red", "orange", "yellow", "green", "blue", "purple", "brown", "black"]
Priority = Literal["low", "medium", "high"]
TargetFailure = Literal["not_found", "forbidden", "version_conflict", "unsupported", "invalid_state"]


class BulkTargetIn(ApiModel):
    type: BulkType
    id: uuid.UUID
    version: int
    occurrence_date: date | None = None
    color: Color | None = None
    priority: Priority | None = None


class BulkIn(ApiModel):
    action: BulkAction
    targets: list[BulkTargetIn] = Field(min_length=1, max_length=500)
    color: Color | None = None
    priority: Priority | None = None


class BulkItemOut(BaseModel):
    type: BulkType
    id: uuid.UUID
    version: int


class BulkOut(BaseModel):
    applied: int
    delete_batch_id: uuid.UUID | None
    items: list[BulkItemOut]
