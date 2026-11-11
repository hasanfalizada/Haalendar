"""Attachment table (domain model 5.13).

+++===+++ 2026-10-17 — Hasan Alizada — HAAL-040. container_kind / container_id are copied from the item when the file is
attached, so row-level security and the audit log treat attachments like the item itself (content_policies, "ref"
mode); an item that moves to another container takes its attachments along (its module updates them). The stored
files are never deleted: a soft-deleted attachment keeps them (FR-X-01).
"""

from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import BigInteger, CheckConstraint, DateTime, ForeignKey, Integer, String, func
from sqlalchemy.orm import Mapped, mapped_column

from haalendar.accounts.models import _uuid7
from haalendar.models import Base

MEDIA_TYPES = ("image/png", "image/jpeg", "image/webp", "image/gif")


class Attachment(Base):
    __tablename__ = "attachment"
    __table_args__ = (
        CheckConstraint(
            f"media_type in ({', '.join(repr(t) for t in MEDIA_TYPES)})", name="media_type_valid"
        ),
        CheckConstraint("size_bytes BETWEEN 1 AND 10485760", name="size_valid"),
        CheckConstraint("container_kind in ('calendar', 'board', 'note')", name="container_kind_valid"),
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=_uuid7)
    item_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("item.id"), index=True)
    container_kind: Mapped[str] = mapped_column(String(10))
    container_id: Mapped[uuid.UUID] = mapped_column()
    uploaded_by: Mapped[uuid.UUID] = mapped_column(ForeignKey("user_account.id"))
    file_name: Mapped[str] = mapped_column(String(120))
    media_type: Mapped[str] = mapped_column(String(20))
    size_bytes: Mapped[int] = mapped_column(Integer)
    width: Mapped[int | None] = mapped_column(Integer)
    height: Mapped[int | None] = mapped_column(Integer)
    content_hash: Mapped[str] = mapped_column(String(64))
    storage_key: Mapped[str] = mapped_column(String(200))
    thumbnail_key: Mapped[str] = mapped_column(String(200))
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
