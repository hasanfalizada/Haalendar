"""Request and response models of the export endpoints (contract: api/modules/collab.yaml — exports).

+++===+++ 2026-10-18 — Hasan Alizada — HAAL-043.
"""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field

from haalendar.security.schemas import ApiModel

Module = Literal["calendar", "todo", "kanban"]
Status = Literal["queued", "running", "ready", "failed", "expired"]


class ExportIn(ApiModel):
    modules: list[Module] = Field(min_length=1, max_length=3)
    include_images: bool = False


class ExportOut(BaseModel):
    id: uuid.UUID
    status: Status
    modules: list[Module]
    include_images: bool
    requested_at: datetime
    finished_at: datetime | None = None
    expires_at: datetime | None = None
    size_bytes: int | None = None
    counts: dict[str, int] | None = None
    error: str | None = None
    download_url: str | None = None


class ExportListOut(BaseModel):
    data: list[ExportOut]
