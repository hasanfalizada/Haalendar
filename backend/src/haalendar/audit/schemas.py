"""Audit record as returned by history endpoints (contract: api/modules/items.yaml — AuditRecord).

+++===+++ 2026-10-16 — Hasan Alizada — HAAL-032.
"""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel

AuditAction = Literal[
    "create", "update", "delete", "restore", "move", "share", "unshare", "login", "logout", "admin"
]


class AuditRecordOut(BaseModel):
    id: uuid.UUID
    occurred_at: datetime
    actor_id: uuid.UUID | None
    actor_name: str | None
    action: AuditAction
    entity_type: str
    entity_id: uuid.UUID
    before: dict[str, Any] | None
    after: dict[str, Any] | None
