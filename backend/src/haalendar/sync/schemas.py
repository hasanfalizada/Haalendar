"""Request and response models of the sync endpoints (contract: api/modules/sync.yaml — sync_pull, sync_push).

+++===+++ 2026-10-21 — Hasan Alizada — HAAL-053. Mutation data is validated per entity by the same rules as the
database (lengths, colours, priorities); unknown fields are refused.
+++===+++ 2026-10-22 — Hasan Alizada — HAAL-066. Items carry the event fields (checked as a whole event by
haalendar.planning.events); ItemCreateData creates an item — only events so far.
+++===+++ 2026-10-29 — Hasan Alizada — HAAL-100. Notes too (D-87): kind `note`, its own container (container_kind
`note` and container_id = its id, or left out), with the note fields pinned, archived_at and position.
"""

from __future__ import annotations

import uuid
from datetime import date, datetime
from typing import Any, Literal

from pydantic import BaseModel, Field, field_validator

from haalendar.security.schemas import ApiModel

Color = Literal["red", "orange", "yellow", "green", "blue", "purple", "brown", "black"]
Priority = Literal["low", "medium", "high"]


class CalendarData(ApiModel):
    name: str | None = Field(default=None, max_length=100)
    color: Color | None = None
    # +++===+++ 2026-10-29 — Hasan Alizada — HAAL-094. Owner's calendar state (D-82): archived (any time; null = not)
    # and the default calendar (only true: the default moves there).
    archived_at: datetime | None = None
    is_default: bool | None = None

    @field_validator("name")
    @classmethod
    def _name(cls, value: str | None) -> str | None:
        if value is not None and not value.strip():
            raise ValueError("Enter a name")
        return value.strip() if value is not None else None


class ItemData(ApiModel):
    title: str | None = Field(default=None, max_length=200)
    body: str | None = Field(default=None, max_length=100_000)
    color: Color | None = None
    priority: Priority | None = None
    location: str | None = Field(default=None, max_length=500)
    all_day: bool | None = None
    start_date: str | None = Field(default=None, max_length=10)
    start_time: str | None = Field(default=None, max_length=8)
    end_date: str | None = Field(default=None, max_length=10)
    end_time: str | None = Field(default=None, max_length=8)
    tzid: str | None = Field(default=None, max_length=64)
    rrule: str | None = Field(default=None, max_length=500)
    pinned: bool | None = None
    archived_at: datetime | None = None
    position: str | None = Field(default=None, max_length=64)
    is_checklist: bool | None = None


class ItemCreateData(ItemData):
    kind: Literal["event", "note"]
    container_kind: Literal["calendar", "note"] | None = None
    container_id: uuid.UUID | None = None
    # +++===+++ 2026-10-29 — Hasan Alizada — HAAL-096. A duplicate (D-84): the event whose attachments it takes along.
    copy_attachments_from: uuid.UUID | None = None


# +++===+++ 2026-10-23 — Hasan Alizada — HAAL-067. exclude / include one occurrence of a series (D-67).
class OccurrenceData(ApiModel):
    occurrence_date: date
    override_event_id: uuid.UUID | None = None


# +++===+++ 2026-10-28 — Hasan Alizada — HAAL-091. A reminder (D-79): its event when created, then one of two forms.
class ReminderData(ApiModel):
    offset_minutes: int | None = Field(default=None, ge=0, le=40320)
    all_day_time: str | None = Field(default=None, max_length=8)
    all_day_days_before: int | None = Field(default=None, ge=0, le=28)


class ReminderCreateData(ReminderData):
    item_id: uuid.UUID


# +++===+++ 2026-10-29 — Hasan Alizada — HAAL-101. A checklist item (D-88): its note when created, then its fields.
class ChecklistItemData(ApiModel):
    text: str | None = Field(default=None, max_length=1000)
    checked: bool | None = None
    position: str | None = Field(default=None, max_length=64)


class ChecklistItemCreateData(ChecklistItemData):
    item_id: uuid.UUID


class MoveData(ApiModel):
    container_kind: Literal["calendar", "board", "note"]
    container_id: uuid.UUID


class MutationIn(ApiModel):
    mutation_id: uuid.UUID
    entity_type: Literal["calendar", "item", "reminder", "checklist_item"]
    entity_id: uuid.UUID
    op: Literal["create", "update", "delete", "restore", "move", "exclude", "include"]
    base_version: int | None = None
    base: dict[str, Any] | None = None
    data: dict[str, Any] | None = None
    client_time: datetime | None = None


class PushIn(ApiModel):
    mutations: list[MutationIn] = Field(min_length=1, max_length=500)


class ProblemOut(BaseModel):
    status: int
    code: str
    title: str
    detail: str | None = None
    errors: list[dict[str, str]] | None = None


class MutationResultOut(BaseModel):
    mutation_id: uuid.UUID
    status: Literal["applied", "duplicate", "conflict", "rejected"]
    version: int | None = None
    fields: list[str] | None = None
    current: dict[str, Any] | None = None
    problem: ProblemOut | None = None
    # +++===+++ 2026-10-22 — Hasan Alizada — HAAL-054. A delete that applied although the record changed meanwhile.
    edited_elsewhere: bool | None = None


class PushOut(BaseModel):
    results: list[MutationResultOut]


class ChangeOut(BaseModel):
    entity_type: str
    entity_id: uuid.UUID
    op: Literal["upsert", "delete", "tombstone"]
    version: int
    data: dict[str, Any] | None = None


class PullOut(BaseModel):
    changes: list[ChangeOut]
    cursor: str
    has_more: bool
