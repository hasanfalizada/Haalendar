"""Request and response models of the sync endpoints (contract: api/modules/sync.yaml — sync_pull, sync_push).

+++===+++ 2026-10-21 — Hasan Alizada — HAAL-053. Mutation data is validated per entity by the same rules as the
database (lengths, colours, priorities); unknown fields are refused.
"""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, Field, field_validator

from haalendar.security.schemas import ApiModel

Color = Literal["red", "orange", "yellow", "green", "blue", "purple", "brown", "black"]
Priority = Literal["low", "medium", "high"]


class CalendarData(ApiModel):
    name: str | None = Field(default=None, max_length=100)
    color: Color | None = None

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


class MoveData(ApiModel):
    container_kind: Literal["calendar", "board", "note"]
    container_id: uuid.UUID


class MutationIn(ApiModel):
    mutation_id: uuid.UUID
    entity_type: Literal["calendar", "item"]
    entity_id: uuid.UUID
    op: Literal["create", "update", "delete", "restore", "move"]
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
