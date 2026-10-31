"""Notes (FR-TODO-01, FR-TODO-03, domain model 5.7, owner decision D-87).

+++===+++ 2026-10-29 — Hasan Alizada — HAAL-100. A note is an item of kind `note` with a `note` row: pinned, archived
(any time archives — the server takes its own time —, null unarchives; archive ≠ delete and an archived note stays
editable), position (fractional index the client computes, lexicographic order). A note is its own container: only
its owner creates it, it cannot move. Title may be empty (a note of body only). Written through sync like events.
"""

from __future__ import annotations

import re
import uuid
from datetime import UTC, datetime
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from haalendar.errors import ProblemCode, ProblemError
from haalendar.logging import get_logger
from haalendar.planning.models import Item, Note

log = get_logger(__name__)

# +++===+++ 2026-10-29 — Hasan Alizada — HAAL-101. is_checklist: the note has a checklist (D-88).
NOTE_FIELDS = ("pinned", "archived_at", "position", "is_checklist")
POSITION = re.compile(r"[0-9A-Za-z]{1,64}")


def _problem(field: str, message: str) -> ProblemError:
    return ProblemError(
        422,
        ProblemCode.VALIDATION_FAILED,
        "Invalid note",
        errors=[{"pointer": f"/{field}", "detail": message}],
    )


def checked_position(value: Any) -> str:
    if not isinstance(value, str) or POSITION.fullmatch(value) is None:
        raise _problem("position", "Use 1 to 64 letters or digits")
    return value


def state_of(note: Note) -> dict[str, Any]:
    """The note fields as they merge: archived as a flag (each side keeps its own time)."""
    return {
        "pinned": note.pinned,
        "archived_at": note.archived_at is not None,
        "position": note.position,
        "is_checklist": note.is_checklist,
    }


def as_flag(values: dict[str, Any]) -> dict[str, Any]:
    """Incoming archive times (base or new) as the flag they merge as."""
    if "archived_at" not in values:
        return values
    return {**values, "archived_at": values["archived_at"] is not None and values["archived_at"] is not False}


def apply(note: Note, values: dict[str, Any]) -> None:
    for name, value in values.items():
        if name == "archived_at":
            note.archived_at = datetime.now(UTC) if value else None
        elif name == "position":
            note.position = checked_position(value)
        elif name == "pinned":
            note.pinned = bool(value)
        elif name == "is_checklist":
            note.is_checklist = bool(value)


async def create_note(
    db: AsyncSession,
    user_id: uuid.UUID,
    item_id: uuid.UUID,
    item_values: dict[str, Any],
    note_values: dict[str, Any],
) -> int:
    """Creates the note item (its own container, owned by the user) and its note row; returns the version."""
    if await db.get(Item, item_id) is not None:
        raise ProblemError(409, ProblemCode.DUPLICATE, "An item with this id exists")
    if "position" not in note_values:
        raise _problem("position", "Required")
    position = checked_position(note_values["position"])
    item = Item(
        id=item_id,
        kind="note",
        owner_id=user_id,
        container_kind="note",
        container_id=item_id,
        title=(item_values.get("title") or "").strip(),
        body=item_values.get("body"),
        color=item_values.get("color") or "brown",
        priority=item_values.get("priority") or "medium",
        created_by=user_id,
        updated_by=user_id,
    )
    db.add(item)
    await db.flush()
    db.add(
        Note(
            id=item_id,
            container_kind="note",
            container_id=item_id,
            pinned=bool(note_values.get("pinned")),
            is_checklist=bool(note_values.get("is_checklist")),
            archived_at=datetime.now(UTC) if note_values.get("archived_at") else None,
            position=position,
        )
    )
    await db.flush()
    log.info("note_created", item_id=str(item_id), user_id=str(user_id))
    return item.version
