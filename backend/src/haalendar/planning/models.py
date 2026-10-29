"""Planning-domain tables that carry access control: the calendar container and container shares.

+++===+++ 2026-10-15 — Hasan Alizada — HAAL-165. Domain model 5.1 (`calendar`) and 5.16 (`share`), common columns P3.
Both tables are protected by row-level security (haalendar.security.rls); endpoints follow in HAAL-094 (calendars)
and HAAL-167 (sharing). Rows are never deleted: containers get `deleted_at`, shares get `revoked_at`.
+++===+++ 2026-10-17 — Hasan Alizada — HAAL-040. Domain model 5.4 `item`, the supertype of events, notes and cards
(owner decision D-45: created now, before its modules, because attachments hang off it). The subtype tables and the
item endpoints arrive with the modules; the full-text column comes with search (HAAL-039).
+++===+++ 2026-10-22 — Hasan Alizada — HAAL-066. Domain model 5.5 `event` (the event details of an item, same id, the
item's container copied) and 5.6 `recurrence_exception` (migration 0016, D-60).
"""

from __future__ import annotations

import uuid
from datetime import date, datetime, time

from sqlalchemy import (
    BigInteger,
    Boolean,
    CheckConstraint,
    Date,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    SmallInteger,
    String,
    Text,
    Time,
    func,
    text,
)
from sqlalchemy.orm import Mapped, mapped_column

from haalendar.accounts.models import _uuid7
from haalendar.models import Base

COLORS = ("red", "orange", "yellow", "green", "blue", "purple", "brown", "black")
PRIORITIES = ("low", "medium", "high")
ITEM_KINDS = ("event", "note", "card")


class Calendar(Base):
    __tablename__ = "calendar"
    __table_args__ = (
        CheckConstraint("char_length(name) BETWEEN 1 AND 100", name="name_length"),
        CheckConstraint(f"color in ({', '.join(repr(c) for c in COLORS)})", name="color_valid"),
        # +++===+++ 2026-10-29 — Hasan Alizada — HAAL-094. Migration 0020 (D-82).
        CheckConstraint("NOT (is_default AND archived_at IS NOT NULL)", name="default_not_archived"),
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


class Item(Base):
    __tablename__ = "item"
    __table_args__ = (
        CheckConstraint(f"kind in ({', '.join(repr(k) for k in ITEM_KINDS)})", name="kind_valid"),
        CheckConstraint("container_kind in ('calendar', 'board', 'note')", name="container_kind_valid"),
        CheckConstraint("char_length(title) <= 200", name="title_length"),
        CheckConstraint(f"color in ({', '.join(repr(c) for c in COLORS)})", name="color_valid"),
        CheckConstraint(f"priority in ({', '.join(repr(p) for p in PRIORITIES)})", name="priority_valid"),
        Index("ix_item_container", "container_kind", "container_id"),
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=_uuid7)
    kind: Mapped[str] = mapped_column(String(10))
    owner_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("user_account.id"), index=True)
    container_kind: Mapped[str] = mapped_column(String(10))
    container_id: Mapped[uuid.UUID] = mapped_column()
    title: Mapped[str] = mapped_column(String(200), default="", server_default="")
    body: Mapped[str | None] = mapped_column(Text)
    color: Mapped[str] = mapped_column(String(10), default="brown", server_default="brown")
    priority: Mapped[str] = mapped_column(String(10), default="medium", server_default="medium")
    legacy_id: Mapped[int | None] = mapped_column(Integer)
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


class Event(Base):
    __tablename__ = "event"

    id: Mapped[uuid.UUID] = mapped_column(ForeignKey("item.id"), primary_key=True)
    container_kind: Mapped[str] = mapped_column(String(10), default="calendar")
    container_id: Mapped[uuid.UUID] = mapped_column()
    all_day: Mapped[bool] = mapped_column(Boolean, default=True, server_default=text("true"))
    start_date: Mapped[date] = mapped_column(Date)
    start_time: Mapped[time | None] = mapped_column(Time)
    end_date: Mapped[date] = mapped_column(Date)
    end_time: Mapped[time | None] = mapped_column(Time)
    tzid: Mapped[str] = mapped_column(String(64))
    start_utc: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    end_utc: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    location: Mapped[str | None] = mapped_column(String(500))
    rrule: Mapped[str | None] = mapped_column(String(500))


class RecurrenceException(Base):
    __tablename__ = "recurrence_exception"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=_uuid7)
    event_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("event.id"))
    container_kind: Mapped[str] = mapped_column(String(10), default="calendar")
    container_id: Mapped[uuid.UUID] = mapped_column()
    occurrence_date: Mapped[date] = mapped_column(Date)
    kind: Mapped[str] = mapped_column(String(10))
    override_event_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("event.id"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    created_by: Mapped[uuid.UUID] = mapped_column(ForeignKey("user_account.id"))
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    delete_batch_id: Mapped[uuid.UUID | None] = mapped_column()
    version: Mapped[int] = mapped_column(BigInteger, default=1, server_default="1")


# +++===+++ 2026-10-28 — Hasan Alizada — HAAL-091. A user's reminder on an item and when it fires next (D-79).
class Reminder(Base):
    __tablename__ = "reminder"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=_uuid7)
    item_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("item.id"))
    owner_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("user_account.id"))
    offset_minutes: Mapped[int | None] = mapped_column(Integer)
    all_day_time: Mapped[time | None] = mapped_column(Time)
    all_day_days_before: Mapped[int | None] = mapped_column(SmallInteger)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    delete_batch_id: Mapped[uuid.UUID | None] = mapped_column()
    version: Mapped[int] = mapped_column(BigInteger, default=1, server_default="1")
    sync_seq: Mapped[int | None] = mapped_column(BigInteger)


class ReminderSchedule(Base):
    __tablename__ = "reminder_schedule"

    reminder_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("reminder.id"), primary_key=True)
    owner_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("user_account.id"))
    needs_check: Mapped[bool] = mapped_column(Boolean, default=True, server_default=text("true"))
    next_fire_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    next_occurrence: Mapped[date | None] = mapped_column(Date)
    last_occurrence: Mapped[date | None] = mapped_column(Date)
    last_fired_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
