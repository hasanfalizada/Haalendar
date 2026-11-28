"""Converting an item to another kind (contract: api/modules/items.yaml — item_convert).

+++===+++ 2026-11-25 13:10 +04 — Hasan Alizada — HAAL-122. `POST /items/{id}/convert`: note ↔ card ↔ event in place,
answered with the item's kind, its version and the batch an undo brings back (D-125; haalendar.planning.convert).
"""

from __future__ import annotations

import uuid
from datetime import date
from typing import Annotated, Literal

from fastapi import APIRouter, Header
from pydantic import Field

from haalendar.deps import Auth, DbSession
from haalendar.planning import convert
from haalendar.security.schemas import ApiModel

router = APIRouter(prefix="/items", tags=["items"])


class ConvertItemIn(ApiModel):
    target_kind: Literal["event", "note", "card"]
    version: int | None = None
    calendar_id: uuid.UUID | None = None
    start_date: date | None = None
    board_id: uuid.UUID | None = None
    column_id: uuid.UUID | None = None
    position: str | None = Field(default=None, pattern=r"^[0-9A-Za-z]{1,64}$")
    undo: uuid.UUID | None = None
    title: str | None = Field(default=None, max_length=200)
    body: str | None = Field(default=None, max_length=100_000)


class ConvertedItemOut(ApiModel):
    item_id: uuid.UUID
    kind: Literal["event", "note", "card"]
    version: int
    batch_id: uuid.UUID


@router.post("/{id}/convert", operation_id="convertItem")
async def convert_item(
    id: uuid.UUID,
    body: ConvertItemIn,
    auth: Auth,
    db: DbSession,
    idempotency_key: Annotated[uuid.UUID | None, Header()] = None,
) -> ConvertedItemOut:
    # Idempotency-Key is accepted per contract; a repeated conversion finds the item converted and changes nothing.
    request = convert.ConvertRequest(
        target_kind=body.target_kind,
        version=body.version,
        calendar_id=body.calendar_id,
        start_date=body.start_date,
        board_id=body.board_id,
        column_id=body.column_id,
        position=body.position,
        undo=body.undo,
        title=body.title,
        body=body.body,
        body_given="body" in body.model_fields_set,
    )
    done = await convert.convert_item(db, auth.user.id, id, request)
    return ConvertedItemOut(
        item_id=done.item_id, kind=done.kind, version=done.version, batch_id=done.batch_id
    )
