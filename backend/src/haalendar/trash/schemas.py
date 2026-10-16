"""Request and response models of the trash endpoints (contract: api/modules/collab.yaml — trash, trash_restore).

+++===+++ 2026-10-16 — Hasan Alizada — HAAL-033.
"""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field

from haalendar.security.schemas import ApiModel

TrashType = Literal["event", "note", "card", "calendar", "board", "column"]
RestorableType = Literal[
    "event",
    "note",
    "card",
    "calendar",
    "board",
    "column",
    "attachment",
    "checklist_item",
    "comment",
    "label",
    "link",
    "reminder",
]
FailureCode = Literal["not_found", "forbidden", "unsupported", "parent_in_trash"]


class TrashEntryOut(BaseModel):
    type: TrashType
    id: uuid.UUID
    title: str
    container_name: str | None = None
    deleted_at: datetime
    deleted_by: uuid.UUID | None
    deleted_by_name: str | None
    delete_batch_id: uuid.UUID
    created_at: datetime
    updated_at: datetime
    contents: dict[str, int]


class TrashPageOut(BaseModel):
    data: list[TrashEntryOut]
    next_cursor: str | None


class RestoreEntryIn(ApiModel):
    type: RestorableType
    id: uuid.UUID


class RestoreIn(ApiModel):
    entries: list[RestoreEntryIn] = Field(min_length=1, max_length=500)


class ParentOut(BaseModel):
    type: str
    id: uuid.UUID
    title: str


class RestoreFailureOut(BaseModel):
    type: str
    id: uuid.UUID
    code: FailureCode
    parent: ParentOut | None = None


class RestoreOut(BaseModel):
    restored: int
    rows: int
    failed: list[RestoreFailureOut]
