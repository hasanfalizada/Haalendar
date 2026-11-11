"""Applied offline mutations (ADR-0009, D-56).

+++===+++ 2026-10-21 — Hasan Alizada — HAAL-053. One row per mutation id: a repeated push answers with the stored
result instead of applying the change again (exactly once). Owner-only row-level security; never deleted.
"""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any

from sqlalchemy import DateTime, ForeignKey, String, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from haalendar.models import Base


class SyncMutation(Base):
    __tablename__ = "sync_mutation"

    mutation_id: Mapped[uuid.UUID] = mapped_column(primary_key=True)
    owner_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("user_account.id"))
    applied_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    status: Mapped[str] = mapped_column(String(10))
    result: Mapped[dict[str, Any]] = mapped_column(JSONB)
