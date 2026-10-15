"""Planning-domain tables that carry access control: the calendar container and container shares.

+++===+++ 2026-10-15 — Hasan Alizada — HAAL-165. Domain model 5.1 (`calendar`) and 5.16 (`share`), common columns P3.
Both tables are protected by row-level security (haalendar.security.rls); endpoints follow in HAAL-094 (calendars)
and HAAL-167 (sharing). Rows are never deleted: containers get `deleted_at`, shares get `revoked_at`.
"""

from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import BigInteger, Boolean, CheckConstraint, DateTime, ForeignKey, Index, String, func, text
from sqlalchemy.orm import Mapped, mapped_column

from haalendar.accounts.models import _uuid7
from haalendar.models import Base

COLORS = ("red", "orange", "yellow", "green", "blue", "purple", "brown", "black")


class Calendar(Base):
    __tablename__ = "calendar"
    __table_args__ = (
        CheckConstraint("char_length(name) BETWEEN 1 AND 100", name="name_length"),
        CheckConstraint(f"color in ({', '.join(repr(c) for c in COLORS)})", name="color_valid"),
        Index(
            "uq_calendar_default_per_owner",
            "owner_id",
            unique=True,
            postgresql_where=text("is_default AND deleted_at IS NULL"),
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=_uuid7)
    owner_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("user_account.id"), index=True)
    name: Mapped[str] = mapped_column(String(100))
    color: Mapped[str] = mapped_column(String(10), default="blue", server_default="blue")
    is_default: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false")
    archived_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )
    created_by: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("user_account.id"))
    updated_by: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("user_account.id"))
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    delete_batch_id: Mapped[uuid.UUID | None] = mapped_column()
    version: Mapped[int] = mapped_column(BigInteger, default=1, server_default="1")
    sync_seq: Mapped[int | None] = mapped_column(BigInteger)


class Share(Base):
    __tablename__ = "share"
    __table_args__ = (
        CheckConstraint("container_kind in ('calendar', 'board', 'note')", name="container_kind_valid"),
        CheckConstraint("permission in ('view', 'edit')", name="permission_valid"),
        Index(
            "uq_share_active_grantee",
            "container_kind",
            "container_id",
            "grantee_id",
            unique=True,
            postgresql_where=text("revoked_at IS NULL"),
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=_uuid7)
    container_kind: Mapped[str] = mapped_column(String(10))
    container_id: Mapped[uuid.UUID] = mapped_column()
    grantee_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("user_account.id"), index=True)
    permission: Mapped[str] = mapped_column(String(10))
    granted_by: Mapped[uuid.UUID] = mapped_column(ForeignKey("user_account.id"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    version: Mapped[int] = mapped_column(BigInteger, default=1, server_default="1")
    sync_seq: Mapped[int | None] = mapped_column(BigInteger)
