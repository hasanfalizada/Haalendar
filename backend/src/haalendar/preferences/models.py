"""User settings (domain model section 6, owner decision D-50).

+++===+++ 2026-10-19 — Hasan Alizada — HAAL-045. One row per user, keyed by owner_id (owner-only row-level security);
never deleted. Defaults: week starts on Monday, 24-hour time, theme follows the system, brown for new items, agenda of
30 days, Week A/B off with labels A and B.
"""

from __future__ import annotations

import uuid
from datetime import date, datetime

from sqlalchemy import BigInteger, Boolean, Date, DateTime, ForeignKey, SmallInteger, String, func
from sqlalchemy.dialects.postgresql import ARRAY
from sqlalchemy.orm import Mapped, mapped_column

from haalendar.models import Base


class UserSettings(Base):
    __tablename__ = "user_settings"

    owner_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("user_account.id"), primary_key=True)
    week_start: Mapped[int] = mapped_column(SmallInteger, default=1, server_default="1")
    time_format: Mapped[str] = mapped_column(String(3), default="24h", server_default="24h")
    theme: Mapped[str] = mapped_column(String(6), default="system", server_default="system")
    default_color: Mapped[str] = mapped_column(String(10), default="brown", server_default="brown")
    agenda_days: Mapped[int] = mapped_column(SmallInteger, default=30, server_default="30")
    week_ab_enabled: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false")
    week_ab_anchor: Mapped[date | None] = mapped_column(Date)
    week_ab_labels: Mapped[list[str]] = mapped_column(
        ARRAY(String(10)), default=lambda: ["A", "B"], server_default="{A,B}"
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    version: Mapped[int] = mapped_column(BigInteger, default=1, server_default="1")
    sync_seq: Mapped[int | None] = mapped_column(BigInteger)
