"""Kanban cards (FR-KAN-03, domain model 5.8, owner decision D-92).

+++===+++ 2026-10-29 — Hasan Alizada — HAAL-112. A card is an item of kind `card` with a `card` row, written through sync
like notes and events, by the board's owner or an edit share (not on an archived board — haalendar.authz):
- its board is its container (it never leaves the board); its column must be a live, not archived column of that
  board; its place in the column is a fractional index the client computes;
- due date ("YYYY-MM-DD") with an optional time ("HH:MM"): wall-clock in the board owner's zone; a date alone means the
  whole day; a time needs a date (clearing the date clears the time);
- the fields merge one by one like the item fields; moving to another column is an update of column_id and position.
Title is required (1-200 after trimming); description, colour and priority are the item's.
+++===+++ 2026-10-30 — Hasan Alizada — HAAL-113. The place of a card — column and position — merges as a pair (D-93): a
conflict on one makes the other one changed a conflict too, so a card moved on two devices at once stays where the first
one put it (never the column of one and the position of the other).
"""

from __future__ import annotations

import uuid
from datetime import date, time
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from haalendar.errors import ProblemCode, ProblemError
from haalendar.logging import get_logger
from haalendar.planning.models import BoardColumn, Card, Item
from haalendar.planning.notes import checked_position

log = get_logger(__name__)

CARD_FIELDS = ("column_id", "position", "due_date", "due_time")
PLACE = ("column_id", "position")


def _problem(field: str, message: str) -> ProblemError:
    return ProblemError(
        422, ProblemCode.VALIDATION_FAILED, "Invalid card", errors=[{"field": field, "message": message}]
    )


def checked_title(value: Any) -> str:
    if not isinstance(value, str) or not value.strip():
        raise _problem("title", "Enter a title")
    return value.strip()


def _due_date(value: Any) -> date | None:
    if value is None:
        return None
    try:
        return date.fromisoformat(str(value)) if len(str(value)) == 10 else None
    except ValueError:
        return None


def _due_time(value: Any) -> time | None:
    if value is None:
        return None
    text = str(value)
    try:
        return time.fromisoformat(text) if len(text) in (5, 8) else None
    except ValueError:
        return None


def normalize(values: dict[str, Any]) -> dict[str, Any]:
    """Incoming card values in their canonical text form (ids as text, "HH:MM:SS" → "HH:MM")."""
    out = dict(values)
    if out.get("column_id") is not None:
        out["column_id"] = str(out["column_id"])
    value = out.get("due_time")
    if isinstance(value, str) and len(value) == 8 and value.endswith(":00"):
        out["due_time"] = value[:5]
    return out


def group_conflicts(changed: list[str], conflicts: list[str]) -> list[str]:
    """A conflict on the column or the position makes both a conflict when both are changed (the place stays)."""
    if not any(name in PLACE for name in conflicts):
        return conflicts
    return sorted(set(conflicts) | {name for name in changed if name in PLACE})


def state_of(card: Card) -> dict[str, Any]:
    return {
        "column_id": str(card.column_id),
        "position": card.position,
        "due_date": card.due_date.isoformat() if card.due_date else None,
        "due_time": card.due_time.strftime("%H:%M") if card.due_time else None,
    }


async def _column(db: AsyncSession, board_id: uuid.UUID, value: Any) -> uuid.UUID:
    try:
        column_id = uuid.UUID(str(value))
    except ValueError:
        raise _problem("column_id", "Not a column") from None
    column = await db.get(BoardColumn, column_id)
    if column is None or column.board_id != board_id or column.deleted_at is not None:
        raise _problem("column_id", "Not a column of this board")
    if column.archived_at is not None:
        raise ProblemError(409, ProblemCode.INVALID_STATE, "This column is archived")
    return column_id


async def apply(db: AsyncSession, card: Card, values: dict[str, Any]) -> None:
    """Writes the card fields given (checked); a date cleared takes the time along."""
    for name, value in values.items():
        if name == "column_id":
            card.column_id = await _column(db, card.board_id, value)
        elif name == "position":
            card.position = checked_position(value)
        elif name == "due_date":
            due = _due_date(value)
            if value is not None and due is None:
                raise _problem("due_date", "Use a date as YYYY-MM-DD")
            card.due_date = due
            if due is None:
                card.due_time = None
        elif name == "due_time":
            at = _due_time(value)
            if value is not None and at is None:
                raise _problem("due_time", "Use a time as HH:MM")
            card.due_time = at
    if card.due_time is not None and card.due_date is None:
        raise _problem("due_time", "A time needs a date")


async def create_card(
    db: AsyncSession,
    user_id: uuid.UUID,
    item_id: uuid.UUID,
    board_id: uuid.UUID,
    item_values: dict[str, Any],
    card_values: dict[str, Any],
) -> int:
    """Creates the card item on the board and its card row; returns the version (rights checked by the caller)."""
    if await db.get(Item, item_id) is not None:
        raise ProblemError(409, ProblemCode.DUPLICATE, "An item with this id exists")
    for name in ("column_id", "position"):
        if card_values.get(name) is None:
            raise _problem(name, "Required")
    item = Item(
        id=item_id,
        kind="card",
        owner_id=user_id,
        container_kind="board",
        container_id=board_id,
        title=checked_title(item_values.get("title")),
        body=item_values.get("body"),
        color=item_values.get("color") or "blue",
        priority=item_values.get("priority") or "medium",
        created_by=user_id,
        updated_by=user_id,
    )
    db.add(item)
    await db.flush()
    card = Card(
        id=item_id,
        container_kind="board",
        container_id=board_id,
        board_id=board_id,
        column_id=await _column(db, board_id, card_values["column_id"]),
        position=checked_position(card_values["position"]),
    )
    await apply(
        db, card, {name: card_values[name] for name in ("due_date", "due_time") if name in card_values}
    )
    db.add(card)
    await db.flush()
    log.info("card_created", item_id=str(item_id), board_id=str(board_id), user_id=str(user_id))
    return item.version
