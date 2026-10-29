"""Calendar and item changes shared by the sync push and the module endpoints that follow (ADR-0009, D-56).

+++===+++ 2026-10-21 — Hasan Alizada — HAAL-053.
- Rights: managing a calendar (rename, colour, delete, restore) is the owner's; changing items needs write access to
  the container (owner or an "edit" share) — the authz atom through `require`, row-level security underneath.
- Field-level merge (ADR-0009): an update carries the values it started from (`base`). A field whose current value
  still equals its base value takes the new value; a field already holding the new value is fine; any other field is a
  conflict — the server value stays and the field is reported. Non-conflicting fields of the same update still apply.
- Delete is soft and takes what belongs to the record into the same batch (a calendar's items and attachments, an
  item's attachments); restore brings the batch back. Repeating either is harmless.
- Every change raises the version and records who made it; the database stamps sync numbers and writes the audit log.
+++===+++ 2026-10-22 — Hasan Alizada — HAAL-066. Events (haalendar.planning.events): created through `create_item`
(kind `event` only for now); `update_item` also merges the event fields (time fields as one group) and checks the
whole event afterwards; moving an event is possible between calendars only, its event row moves along.
+++===+++ 2026-10-22 — Hasan Alizada — HAAL-054. A delete carrying the version it was made on applies anyway (ADR-0009
rule 4) and says when the record had changed since (`edited_elsewhere`), so the user can be told.
+++===+++ 2026-10-23 — Hasan Alizada — HAAL-067. Moving a series moves its recurrence exceptions along (they copy the
calendar for row-level security); excluding and including occurrences live in haalendar.planning.occurrences.
+++===+++ 2026-10-29 — Hasan Alizada — HAAL-094. Multiple calendars (FR-CAL-32, D-82): every user has one default
calendar, made when the user is created (`create_default_calendar`); the owner can make another one the default
(`is_default: true` moves it there, `false` is refused), archive (`archived_at`: any timestamp archives — the server
takes its own time —, null unarchives) and unarchive. The default calendar cannot be archived or deleted, an archived
one cannot become the default; an archived calendar is read-only (haalendar.authz).
+++===+++ 2026-10-29 — Hasan Alizada — HAAL-100. Notes (haalendar.planning.notes, D-87): created through `create_item`
(kind `note`, its own container, the owner only); `update_item` also merges the note fields (archived as a flag);
a note cannot move. Delete and restore are the same as for every item.
+++===+++ 2026-10-29 — Hasan Alizada — HAAL-101. An item's delete takes its checklist items into the batch (D-88).
+++===+++ 2026-10-29 — Hasan Alizada — HAAL-112. Cards (haalendar.planning.cards, D-92): created through `create_item`
(kind `card` on a board, in a live column); `update_item` also merges the card fields (column, position, due date and
time); a card never leaves its board. An item's delete takes its labels into the batch too.
"""

from __future__ import annotations

import uuid
from dataclasses import dataclass, field
from datetime import UTC, datetime
from typing import Any

from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from haalendar.attachments.models import Attachment
from haalendar.authz import require
from haalendar.errors import ProblemCode, ProblemError
from haalendar.logging import get_logger
from haalendar.planning import cards, events, notes
from haalendar.planning.models import (
    Calendar,
    Card,
    ChecklistItem,
    Event,
    Item,
    ItemLabel,
    Note,
    RecurrenceException,
)
from haalendar.security.rls import ContainerKind
from haalendar.softdelete import new_batch, restore_batch

log = get_logger(__name__)


@dataclass(frozen=True)
class Outcome:
    """Result of one change: applied, or applied in part with conflicting fields kept at the server value."""

    version: int
    conflicts: list[str] = field(default_factory=list)
    edited_elsewhere: bool = False


def merge(
    current: dict[str, Any], base: dict[str, Any], new: dict[str, Any]
) -> tuple[dict[str, Any], list[str]]:
    """Fields to write and fields in conflict, per the field-level rule above."""
    apply: dict[str, Any] = {}
    conflicts: list[str] = []
    for name, value in new.items():
        if current.get(name) == value:
            continue
        if name in base and current.get(name) == base[name]:
            apply[name] = value
        else:
            conflicts.append(name)
    return apply, sorted(conflicts)


def _not_found() -> ProblemError:
    return ProblemError(404, ProblemCode.NOT_FOUND, "Not found")


def _deleted(current: dict[str, Any]) -> ProblemError:
    return ProblemError(409, ProblemCode.INVALID_STATE, "It was deleted on another device", current=current)


async def _calendar(db: AsyncSession, calendar_id: uuid.UUID) -> Calendar:
    calendar = await db.get(Calendar, calendar_id)
    if calendar is None:  # unknown or not readable under row-level security
        raise _not_found()
    return calendar


def _owner_only(calendar: Calendar, user_id: uuid.UUID) -> None:
    if calendar.owner_id != user_id:
        raise ProblemError(403, ProblemCode.FORBIDDEN, "Only the owner can change this calendar")


async def create_calendar(
    db: AsyncSession, user_id: uuid.UUID, calendar_id: uuid.UUID, name: str, color: str
) -> Calendar:
    if await db.get(Calendar, calendar_id) is not None:
        raise ProblemError(409, ProblemCode.DUPLICATE, "A calendar with this id exists")
    calendar = Calendar(
        id=calendar_id, owner_id=user_id, name=name, color=color, created_by=user_id, updated_by=user_id
    )
    db.add(calendar)
    await db.flush()
    log.info("calendar_created", calendar_id=str(calendar_id), user_id=str(user_id))
    return calendar


DEFAULT_CALENDAR_NAME = "My calendar"


async def create_default_calendar(db: AsyncSession, owner_id: uuid.UUID) -> Calendar:
    """The default calendar of a user just created (row-level security: written as that user, then given back)."""
    previous = await db.scalar(select(func.current_setting("app.user_id", True)))
    await db.execute(select(func.set_config("app.user_id", str(owner_id), True)))
    calendar = Calendar(
        owner_id=owner_id,
        name=DEFAULT_CALENDAR_NAME,
        color="blue",
        is_default=True,
        created_by=owner_id,
        updated_by=owner_id,
    )
    db.add(calendar)
    await db.flush()
    await db.execute(select(func.set_config("app.user_id", previous or "", True)))
    log.info("default_calendar_created", calendar_id=str(calendar.id), user_id=str(owner_id))
    return calendar


def _calendar_fields(calendar: Calendar) -> dict[str, Any]:
    # The archive state merges as archived or not: the client sends its own time, the server keeps its own.
    return {
        "name": calendar.name,
        "color": calendar.color,
        "archived_at": calendar.archived_at is not None,
        "is_default": calendar.is_default,
    }


def _archived_flag(values: dict[str, Any]) -> dict[str, Any]:
    return {**values, "archived_at": values["archived_at"] is not None} if "archived_at" in values else values


def _invalid_state(message: str) -> ProblemError:
    return ProblemError(409, ProblemCode.INVALID_STATE, message)


async def _make_default(db: AsyncSession, calendar: Calendar, user_id: uuid.UUID) -> None:
    """The owner's previous default gives way (one default per owner)."""
    previous = await db.scalar(
        select(Calendar).where(
            Calendar.owner_id == calendar.owner_id,
            Calendar.is_default.is_(True),
            Calendar.deleted_at.is_(None),
            Calendar.id != calendar.id,
        )
    )
    if previous is not None:
        previous.is_default = False
        previous.version += 1
        previous.updated_by = user_id
        await db.flush()


async def update_calendar(
    db: AsyncSession,
    user_id: uuid.UUID,
    calendar_id: uuid.UUID,
    base: dict[str, Any],
    new: dict[str, Any],
    current_state: dict[str, Any],
) -> Outcome:
    calendar = await _calendar(db, calendar_id)
    _owner_only(calendar, user_id)
    if calendar.deleted_at is not None:
        raise _deleted(current_state)
    apply, conflicts = merge(_calendar_fields(calendar), _archived_flag(base), _archived_flag(new))
    archived = apply.get("archived_at", calendar.archived_at is not None)
    default = apply.get("is_default", calendar.is_default)
    if apply.get("is_default") is False:
        raise _invalid_state("Make another calendar the default instead")
    if archived and default:
        raise _invalid_state(
            "An archived calendar cannot be the default"
            if apply.get("is_default")
            else "The default calendar cannot be archived"
        )
    if apply:
        if apply.get("is_default"):
            await _make_default(db, calendar, user_id)
        for name, value in apply.items():
            if name == "archived_at":
                calendar.archived_at = datetime.now(UTC) if value else None
            else:
                setattr(calendar, name, value)
        calendar.version += 1
        calendar.updated_by = user_id
        await db.flush()
    log.info("calendar_updated", calendar_id=str(calendar_id), fields=sorted(apply), conflicts=conflicts)
    return Outcome(version=calendar.version, conflicts=conflicts)


async def delete_calendar(
    db: AsyncSession, user_id: uuid.UUID, calendar_id: uuid.UUID, base_version: int | None = None
) -> Outcome:
    calendar = await _calendar(db, calendar_id)
    _owner_only(calendar, user_id)
    if calendar.is_default and calendar.deleted_at is None:
        raise _invalid_state("The default calendar cannot be deleted")
    edited = calendar.deleted_at is None and base_version is not None and calendar.version != base_version
    if calendar.deleted_at is None:
        batch = new_batch()
        now = datetime.now(UTC)
        changes = {"deleted_at": now, "delete_batch_id": batch, "updated_by": user_id}
        for model in (Item, Attachment):
            await db.execute(
                update(model)
                .where(
                    model.container_kind == "calendar",
                    model.container_id == calendar_id,
                    model.deleted_at.is_(None),
                )
                .values(**changes, version=model.version + 1)
                .execution_options(synchronize_session=False)
            )
        calendar.deleted_at, calendar.delete_batch_id, calendar.updated_by = now, batch, user_id
        calendar.version += 1
        await db.flush()
        log.info("calendar_deleted", calendar_id=str(calendar_id), batch_id=str(batch), user_id=str(user_id))
    return Outcome(version=calendar.version, edited_elsewhere=edited)


async def restore_calendar(db: AsyncSession, user_id: uuid.UUID, calendar_id: uuid.UUID) -> Outcome:
    calendar = await _calendar(db, calendar_id)
    _owner_only(calendar, user_id)
    if calendar.deleted_at is not None and calendar.delete_batch_id is not None:
        await restore_batch(db, [Calendar, Item, Attachment], calendar.delete_batch_id, user_id)
        await db.refresh(calendar)
    return Outcome(version=calendar.version)


async def _item(db: AsyncSession, item_id: uuid.UUID) -> Item:
    item = await db.get(Item, item_id)
    if item is None:
        raise _not_found()
    return item


async def _writable(db: AsyncSession, user_id: uuid.UUID, kind: str, container_id: uuid.UUID) -> None:
    await require(db, user_id, "write_items", _container_kind(kind), container_id)


def _container_kind(kind: str) -> ContainerKind:
    if kind not in ("calendar", "board", "note"):
        raise ProblemError(422, ProblemCode.VALIDATION_FAILED, "Unknown container kind")
    return kind  # type: ignore[return-value]  # checked above


ITEM_FIELDS = ("title", "body", "color", "priority")


async def create_item(
    db: AsyncSession, user_id: uuid.UUID, item_id: uuid.UUID, data: dict[str, Any]
) -> Outcome:
    """A new item: an event in a calendar, a note or a card on a board."""
    item_values = {name: data[name] for name in ITEM_FIELDS if name in data}
    if data.get("kind") == "card":
        if data.get("container_id") is None or data.get("container_kind") != "board":
            raise ProblemError(422, ProblemCode.VALIDATION_FAILED, "A card belongs to a board")
        foreign = (*events.EVENT_FIELDS, *(name for name in notes.NOTE_FIELDS if name != "position"))
        if any(name in data for name in foreign):
            raise ProblemError(422, ProblemCode.VALIDATION_FAILED, "Only cards have these fields here")
        board_id = uuid.UUID(str(data["container_id"]))
        await _writable(db, user_id, "board", board_id)
        card_values = cards.normalize({name: data[name] for name in cards.CARD_FIELDS if name in data})
        return Outcome(
            version=await cards.create_card(db, user_id, item_id, board_id, item_values, card_values)
        )
    if any(name in cards.CARD_FIELDS and name not in notes.NOTE_FIELDS for name in data):
        raise ProblemError(422, ProblemCode.VALIDATION_FAILED, "Only cards have card fields")
    if data.get("kind") == "note":
        if data.get("container_id") not in (None, item_id) or data.get("container_kind", "note") != "note":
            raise ProblemError(422, ProblemCode.VALIDATION_FAILED, "A note is its own container")
        note_values = {name: data[name] for name in notes.NOTE_FIELDS if name in data}
        return Outcome(version=await notes.create_note(db, user_id, item_id, item_values, note_values))
    if data.get("container_id") is None or data.get("container_kind") != "calendar":
        raise ProblemError(422, ProblemCode.VALIDATION_FAILED, "An event belongs to a calendar")
    if any(name in notes.NOTE_FIELDS for name in data):
        raise ProblemError(422, ProblemCode.VALIDATION_FAILED, "Only notes have note fields")
    container_id = uuid.UUID(str(data["container_id"]))
    await _writable(db, user_id, "calendar", container_id)
    await _calendar(db, container_id)
    event_values = {name: data[name] for name in events.EVENT_FIELDS if name in data}
    version = await events.create_event(db, user_id, item_id, container_id, item_values, event_values)
    if data.get("copy_attachments_from") is not None:
        await _copy_attachments(
            db, user_id, uuid.UUID(str(data["copy_attachments_from"])), item_id, container_id
        )
    return Outcome(version=version)


# +++===+++ 2026-10-29 — Hasan Alizada — HAAL-096. A duplicate (FR-CAL-34, D-84) takes the live attachments of the event
# it was copied from: new attachment rows of the new item pointing at the same stored files (they are content-addressed
# and never deleted, so nothing is copied), written by the user who duplicates. Only when that user can read the
# source; a source deleted or no longer readable meanwhile (the duplicate was made offline) leaves the copy without
# them rather than refusing it.
async def _copy_attachments(
    db: AsyncSession, user_id: uuid.UUID, source_id: uuid.UUID, item_id: uuid.UUID, container_id: uuid.UUID
) -> None:
    source = await db.get(Item, source_id)
    if source is None or source.deleted_at is not None:
        log.info("attachments_not_copied", source_id=str(source_id), item_id=str(item_id), reason="gone")
        return
    try:
        await require(db, user_id, "read", _container_kind(source.container_kind), source.container_id)
    except ProblemError:
        log.info("attachments_not_copied", source_id=str(source_id), item_id=str(item_id), reason="no_access")
        return
    rows = await db.scalars(
        select(Attachment)
        .where(Attachment.item_id == source_id, Attachment.deleted_at.is_(None))
        .order_by(Attachment.created_at, Attachment.id)
    )
    copied = [
        Attachment(
            id=uuid.uuid7(),
            item_id=item_id,
            container_kind="calendar",
            container_id=container_id,
            uploaded_by=user_id,
            file_name=row.file_name,
            media_type=row.media_type,
            size_bytes=row.size_bytes,
            width=row.width,
            height=row.height,
            content_hash=row.content_hash,
            storage_key=row.storage_key,
            thumbnail_key=row.thumbnail_key,
            created_by=user_id,
            updated_by=user_id,
        )
        for row in rows
    ]
    db.add_all(copied)
    await db.flush()
    log.info("attachments_copied", source_id=str(source_id), item_id=str(item_id), count=len(copied))


async def update_item(
    db: AsyncSession,
    user_id: uuid.UUID,
    item_id: uuid.UUID,
    base: dict[str, Any],
    new: dict[str, Any],
    current_state: dict[str, Any],
) -> Outcome:
    item = await _item(db, item_id)
    await _writable(db, user_id, item.container_kind, item.container_id)
    if item.deleted_at is not None:
        raise _deleted(current_state)
    event = await db.get(Event, item_id) if item.kind == "event" else None
    if event is None and any(name in events.EVENT_FIELDS for name in new):
        raise ProblemError(422, ProblemCode.VALIDATION_FAILED, "Only events have event fields")
    note = await db.get(Note, item_id) if item.kind == "note" else None
    card = await db.get(Card, item_id) if item.kind == "card" else None
    # `position` belongs to notes and cards alike.
    if note is None and any(
        name in notes.NOTE_FIELDS and not (card and name in cards.CARD_FIELDS) for name in new
    ):
        raise ProblemError(422, ProblemCode.VALIDATION_FAILED, "Only notes have note fields")
    if card is None and any(
        name in cards.CARD_FIELDS and not (note and name in notes.NOTE_FIELDS) for name in new
    ):
        raise ProblemError(422, ProblemCode.VALIDATION_FAILED, "Only cards have card fields")
    current = {name: getattr(item, name) for name in ITEM_FIELDS}
    if event is not None:
        current.update(events.state_of(event))
    new, base = events.normalize(new), events.normalize(base)
    if note is not None:
        current.update(notes.state_of(note))
        new, base = notes.as_flag(new), notes.as_flag(base)
    if card is not None:
        current.update(cards.state_of(card))
        new, base = cards.normalize(new), cards.normalize(base)
    apply, conflicts = merge(current, base, new)
    if event is not None:
        changed = [name for name, value in new.items() if current.get(name) != value]
        conflicts = events.group_conflicts(changed, conflicts)
        apply = {name: value for name, value in apply.items() if name not in conflicts}
        event_changes = {name: value for name, value in apply.items() if name in events.EVENT_FIELDS}
        if event_changes:
            events.apply(event, events.checked({**events.state_of(event), **event_changes}))
        if "title" in apply:
            apply["title"] = events.title_of(apply["title"])
    if note is not None:
        notes.apply(note, {name: value for name, value in apply.items() if name in notes.NOTE_FIELDS})
        if "title" in apply:
            apply["title"] = (apply["title"] or "").strip()
    if card is not None:
        await cards.apply(
            db, card, {name: value for name, value in apply.items() if name in cards.CARD_FIELDS}
        )
        if "title" in apply:
            apply["title"] = cards.checked_title(apply["title"])
    if apply:
        for name, value in apply.items():
            if name in ITEM_FIELDS:
                setattr(item, name, value)
        item.version += 1
        item.updated_by = user_id
        await db.flush()
    log.info("item_updated", item_id=str(item_id), fields=sorted(apply), conflicts=conflicts)
    return Outcome(version=item.version, conflicts=conflicts)


async def move_item(
    db: AsyncSession,
    user_id: uuid.UUID,
    item_id: uuid.UUID,
    base: dict[str, Any],
    target_kind: str,
    target_id: uuid.UUID,
    current_state: dict[str, Any],
) -> Outcome:
    item = await _item(db, item_id)
    await _writable(db, user_id, item.container_kind, item.container_id)
    if item.kind == "note":
        raise ProblemError(422, ProblemCode.VALIDATION_FAILED, "A note is its own container")
    await _writable(db, user_id, target_kind, target_id)
    if item.deleted_at is not None:
        raise _deleted(current_state)
    current = {"container_kind": item.container_kind, "container_id": str(item.container_id)}
    new = {"container_kind": target_kind, "container_id": str(target_id)}
    apply, conflicts = merge(current, {k: str(v) for k, v in base.items()}, new)
    if item.kind == "event" and target_kind != "calendar":
        raise ProblemError(422, ProblemCode.VALIDATION_FAILED, "An event belongs to a calendar")
    # +++===+++ 2026-10-29 — Hasan Alizada — HAAL-112. A card stays on its board (another column: update column_id).
    if item.kind == "card":
        raise ProblemError(422, ProblemCode.VALIDATION_FAILED, "A card stays on its board")
    if apply and not conflicts:
        item.container_kind, item.container_id = target_kind, target_id
        if item.kind == "event":
            await db.execute(
                update(Event)
                .where(Event.id == item_id)
                .values(container_kind=target_kind, container_id=target_id)
                .execution_options(synchronize_session=False)
            )
            await db.execute(
                update(RecurrenceException)
                .where(RecurrenceException.event_id == item_id)
                .values(container_id=target_id)
                .execution_options(synchronize_session=False)
            )
        item.version += 1
        item.updated_by = user_id
        await db.execute(
            update(Attachment)
            .where(Attachment.item_id == item_id)
            .values(container_kind=target_kind, container_id=target_id)
            .execution_options(synchronize_session=False)
        )
        await db.flush()
        log.info("item_moved", item_id=str(item_id), user_id=str(user_id))
    return Outcome(version=item.version, conflicts=conflicts)


async def delete_item(
    db: AsyncSession, user_id: uuid.UUID, item_id: uuid.UUID, base_version: int | None = None
) -> Outcome:
    item = await _item(db, item_id)
    await _writable(db, user_id, item.container_kind, item.container_id)
    edited = item.deleted_at is None and base_version is not None and item.version != base_version
    if item.deleted_at is None:
        batch, now = new_batch(), datetime.now(UTC)
        for model in (Attachment, ChecklistItem, ItemLabel):
            await db.execute(
                update(model)
                .where(model.item_id == item_id, model.deleted_at.is_(None))
                .values(deleted_at=now, delete_batch_id=batch, updated_by=user_id, version=model.version + 1)
                .execution_options(synchronize_session=False)
            )
        item.deleted_at, item.delete_batch_id, item.updated_by = now, batch, user_id
        item.version += 1
        await db.flush()
        log.info("item_deleted", item_id=str(item_id), batch_id=str(batch), user_id=str(user_id))
    return Outcome(version=item.version, edited_elsewhere=edited)


async def restore_item(db: AsyncSession, user_id: uuid.UUID, item_id: uuid.UUID) -> Outcome:
    item = await _item(db, item_id)
    await _writable(db, user_id, item.container_kind, item.container_id)
    if item.deleted_at is not None and item.delete_batch_id is not None:
        await restore_batch(db, [Item, Attachment, ChecklistItem, ItemLabel], item.delete_batch_id, user_id)
        await db.refresh(item)
    return Outcome(version=item.version)
