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
    # +++===+++ 2026-10-29 — Hasan Alizada — HAAL-095. The UID of an event imported from an .ics file (D-83): a second
    # import of the same file into the same calendar skips it.
    ics_uid: Mapped[str | None] = mapped_column(String(255))


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
    # +++===+++ 2026-10-29 — Hasan Alizada — HAAL-105. The third form, of notes (D-89): a date and time, once.
    remind_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
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


# +++===+++ 2026-10-29 — Hasan Alizada — HAAL-100. A note (domain model 5.7, FR-TODO-01/03): the note details of an item
# of kind `note` (1:1, same id). A note is its own container (container_kind `note`, container_id = its id), copied
# here like on `event` for row-level security and the audit log. `position` orders the notes (fractional index,
# lexicographic); archived ≠ deleted. Due date and checklist mode are used by HAAL-101/104.
class Note(Base):
    __tablename__ = "note"

    id: Mapped[uuid.UUID] = mapped_column(ForeignKey("item.id"), primary_key=True)
    container_kind: Mapped[str] = mapped_column(String(10), default="note")
    container_id: Mapped[uuid.UUID] = mapped_column()
    pinned: Mapped[bool] = mapped_column(Boolean, default=False, server_default=text("false"))
    archived_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    position: Mapped[str] = mapped_column(String(64))
    due_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    is_checklist: Mapped[bool] = mapped_column(Boolean, default=False, server_default=text("false"))


# +++===+++ 2026-10-29 — Hasan Alizada — HAAL-101. A checklist item of a note (domain model 5.10, FR-TODO-02, D-88; cards
# later): its own synced row with the note's container copied for row-level security; text 1-500, checked with the
# time it was checked, position (fractional index; checked items are shown at the bottom, keeping their position).
class ChecklistItem(Base):
    __tablename__ = "checklist_item"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=_uuid7)
    item_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("item.id"), index=True)
    container_kind: Mapped[str] = mapped_column(String(10))
    container_id: Mapped[uuid.UUID] = mapped_column()
    # Before `text`: in the class body that name would hide sqlalchemy's text() used here.
    checked: Mapped[bool] = mapped_column(Boolean, default=False, server_default=text("false"))
    text: Mapped[str] = mapped_column(String(500))
    checked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    position: Mapped[str] = mapped_column(String(64))
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


# +++===+++ 2026-10-29 — Hasan Alizada — HAAL-110. A Kanban board (domain model 5.3, FR-KAN-01, D-90): a container like a
# calendar — owner, name 1-100, position (the owner's board order, fractional index), archived (read-only for everyone,
# archive ≠ delete). Shared like a calendar; its columns and cards follow with HAAL-111/112.
class Board(Base):
    __tablename__ = "board"
    __table_args__ = (
        CheckConstraint("char_length(btrim(name)) BETWEEN 1 AND 100", name="name_length"),
        CheckConstraint("position ~ '^[0-9A-Za-z]{1,64}$'", name="position_valid"),
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=_uuid7)
    owner_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("user_account.id"), index=True)
    name: Mapped[str] = mapped_column(String(100))
    position: Mapped[str] = mapped_column(String(64))
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


# +++===+++ 2026-10-29 — Hasan Alizada — HAAL-111. A column of a board (domain model 5.3, FR-KAN-02, D-91): name 1-60,
# position (fractional index, left to right), an optional WIP limit (1-999; exceeding it only warns), archived. The
# board is copied as its container (container_kind `board`, container_id = board_id) for row-level security and the
# audit log: written by the board's owner or an edit share.
class BoardColumn(Base):
    __tablename__ = "board_column"
    __table_args__ = (
        CheckConstraint("container_kind = 'board' AND container_id = board_id", name="board_container"),
        CheckConstraint("char_length(btrim(name)) BETWEEN 1 AND 60", name="name_length"),
        CheckConstraint("position ~ '^[0-9A-Za-z]{1,64}$'", name="position_valid"),
        CheckConstraint("wip_limit IS NULL OR wip_limit BETWEEN 1 AND 999", name="wip_limit_range"),
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=_uuid7)
    board_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("board.id"), index=True)
    container_kind: Mapped[str] = mapped_column(String(10), default="board")
    container_id: Mapped[uuid.UUID] = mapped_column()
    name: Mapped[str] = mapped_column(String(60))
    position: Mapped[str] = mapped_column(String(64))
    wip_limit: Mapped[int | None] = mapped_column(SmallInteger)
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


# +++===+++ 2026-10-29 — Hasan Alizada — HAAL-112. A card (domain model 5.8, FR-KAN-03, D-92): the card details of an item
# of kind `card` (1:1, same id) — its column on the board and its place there (fractional index), a due date with an
# optional time (wall-clock in the board owner's zone; a date alone means the whole day). The board is copied as its
# container like on `event`, for row-level security and the audit log.
class Card(Base):
    __tablename__ = "card"
    __table_args__ = (
        CheckConstraint("container_kind = 'board' AND container_id = board_id", name="board_container"),
        CheckConstraint("position ~ '^[0-9A-Za-z]{1,64}$'", name="position_valid"),
        CheckConstraint("due_time IS NULL OR due_date IS NOT NULL", name="due_time_needs_date"),
    )

    id: Mapped[uuid.UUID] = mapped_column(ForeignKey("item.id"), primary_key=True)
    container_kind: Mapped[str] = mapped_column(String(10), default="board")
    container_id: Mapped[uuid.UUID] = mapped_column()
    board_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("board.id"), index=True)
    column_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("board_column.id"), index=True)
    position: Mapped[str] = mapped_column(String(64))
    due_date: Mapped[date | None] = mapped_column(Date)
    due_time: Mapped[time | None] = mapped_column(Time)


# +++===+++ 2026-10-29 — Hasan Alizada — HAAL-112. A label of a board (domain model 5.11, D-92): name 1-40 (unique on the
# board among live labels, case ignored), colour; shared by everyone on the board. The board is its container.
class Label(Base):
    __tablename__ = "label"
    __table_args__ = (
        CheckConstraint("container_kind = 'board' AND container_id = board_id", name="board_container"),
        CheckConstraint("char_length(btrim(name)) BETWEEN 1 AND 40", name="name_length"),
        CheckConstraint(f"color in ({', '.join(repr(c) for c in COLORS)})", name="color_valid"),
        Index(
            "uq_label_name_per_board",
            "board_id",
            text("lower(name)"),
            unique=True,
            postgresql_where=text("deleted_at IS NULL"),
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=_uuid7)
    board_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("board.id"), index=True)
    container_kind: Mapped[str] = mapped_column(String(10), default="board")
    container_id: Mapped[uuid.UUID] = mapped_column()
    name: Mapped[str] = mapped_column(String(40))
    color: Mapped[str] = mapped_column(String(10))
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


# +++===+++ 2026-10-29 — Hasan Alizada — HAAL-112. A label on an item (domain model 5.11, D-92): its own synced row, so a
# label set on one device and another set elsewhere both stay (a set as add / remove, ADR-0009); removing is a soft
# delete. At most one live row per item and label. The item's container is copied for row-level security.
class ItemLabel(Base):
    __tablename__ = "item_label"
    __table_args__ = (
        Index(
            "uq_item_label_live",
            "item_id",
            "label_id",
            unique=True,
            postgresql_where=text("deleted_at IS NULL"),
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=_uuid7)
    item_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("item.id"), index=True)
    label_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("label.id"), index=True)
    container_kind: Mapped[str] = mapped_column(String(10))
    container_id: Mapped[uuid.UUID] = mapped_column()
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


# +++===+++ 2026-10-30 — Hasan Alizada — HAAL-119. A card's assignee (domain model 5.9, D-97): its own synced row like a
# label on an item (a set as add / remove, ADR-0009) instead of a composite key; at most one live row per card and
# user. The card's board is copied as its container for row-level security.
class CardAssignee(Base):
    __tablename__ = "card_assignee"
    __table_args__ = (
        Index(
            "uq_card_assignee_live",
            "item_id",
            "user_id",
            unique=True,
            postgresql_where=text("deleted_at IS NULL"),
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=_uuid7)
    item_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("item.id"), index=True)
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("user_account.id"), index=True)
    container_kind: Mapped[str] = mapped_column(String(10), default="board")
    container_id: Mapped[uuid.UUID] = mapped_column()
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


# +++===+++ 2026-10-30 — Hasan Alizada — HAAL-120. A link between two items (domain model 5.14, D-98): its own synced row
# carrying the containers of both ends — `container_kind` / `container_id` of the first (as every content row, for the
# audit log and live updates) and `to_container_kind` / `to_container_id` of the second — so whoever reads either end
# reads the link. At most one live link per unordered pair; soft-deleted only.
class Link(Base):
    __tablename__ = "link"
    __table_args__ = (
        Index(
            "uq_link_live_pair",
            func.least(text("from_item_id"), text("to_item_id")),
            func.greatest(text("from_item_id"), text("to_item_id")),
            unique=True,
            postgresql_where=text("deleted_at IS NULL"),
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=_uuid7)
    from_item_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("item.id"), index=True)
    to_item_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("item.id"), index=True)
    container_kind: Mapped[str] = mapped_column(String(10))
    container_id: Mapped[uuid.UUID] = mapped_column()
    to_container_kind: Mapped[str] = mapped_column(String(10))
    to_container_id: Mapped[uuid.UUID] = mapped_column()
    origin: Mapped[str] = mapped_column(String(12), default="manual")
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
