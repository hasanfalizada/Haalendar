"""Notifications (domain model 5.17, owner decision D-52).

+++===+++ 2026-10-19 — Hasan Alizada — HAAL-048. One row per notification for one user (owner_id; owner-only row-level
security). Never deleted: read or unread. The text is built by the client from kind + payload.
"""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any

from sqlalchemy import DateTime, ForeignKey, String, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from haalendar.accounts.models import _uuid7
from haalendar.models import Base


class Notification(Base):
    __tablename__ = "notification"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=_uuid7)
    owner_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("user_account.id"))
    kind: Mapped[str] = mapped_column(String(20))
    item_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("item.id"))
    payload: Mapped[dict[str, Any]] = mapped_column(JSONB, default=dict, server_default="{}")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    read_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    delivered_push_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
