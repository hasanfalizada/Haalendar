"""Export requests (owner decision D-48).

+++===+++ 2026-10-18 — Hasan Alizada — HAAL-043. One row per requested export: what was chosen, its progress and the
archive. Rows are never deleted; the archive file expires after 7 days (status expired).
"""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any

from sqlalchemy import JSON, BigInteger, Boolean, CheckConstraint, DateTime, ForeignKey, String, func
from sqlalchemy.dialects.postgresql import ARRAY
from sqlalchemy.orm import Mapped, mapped_column

from haalendar.accounts.models import _uuid7
from haalendar.models import Base

STATUSES = ("queued", "running", "ready", "failed", "expired")


class ExportRequest(Base):
    __tablename__ = "export_request"
    __table_args__ = (
        CheckConstraint(f"status in ({', '.join(repr(s) for s in STATUSES)})", name="status_valid"),
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=_uuid7)
    owner_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("user_account.id"))
    status: Mapped[str] = mapped_column(String(10), default="queued", server_default="queued")
    modules: Mapped[list[str]] = mapped_column(ARRAY(String(10)))
    include_images: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false")
    requested_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    file_key: Mapped[str | None] = mapped_column(String(200))
    size_bytes: Mapped[int | None] = mapped_column(BigInteger)
    counts: Mapped[dict[str, Any] | None] = mapped_column(JSON)
    error: Mapped[str | None] = mapped_column(String(64))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )
    version: Mapped[int] = mapped_column(BigInteger, default=1, server_default="1")
