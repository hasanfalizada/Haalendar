"""Converting an item to another kind: note ↔ card ↔ event (FR-INT-02, owner decision D-125).

+++===+++ 2026-11-25 13:10 +04 — Hasan Alizada — HAAL-122. In place: the item keeps its id, so its links, attachments
(the same files) and history stay without copying; one transaction, every row stamped for sync and the audit log.
- Kept: title, description, colour, priority. An event's start becomes the due date and back: a due date without a time
  makes an all-day event, with a time an event of one hour in the user's zone; no date makes it fall on `start_date`
  (by default today in the user's zone). An event's place goes to the top of the description. A checklist stays
  between notes and cards (its rows move along) and becomes a Markdown list in an event's description.
- What the new kind has no place for is soft-deleted in one batch, answered to the client: labels without a label of
  the same name where the item goes (a label with that name is put on instead), a card's assignees and comments, the
  checklist rows of an event, the user's own reminders of another form (a note's are a date and time, an event's and a
  card's count from the start or due date). Other users' reminders of another form stay and fire no more.
- The details of the earlier kind (the `event`, `note` or `card` row — never deleted physically, FR-X-01) stay where
  they were; only the row of the item's kind counts (sync, exports and the views read by kind). Converting back to a
  kind reuses its row with values made anew; Undo (`undo` = the batch) takes them as they were: the earlier place and
  details, the title and description the client had, and the rows the batch took come back.
- Rights: write access where the item is and where it goes (haalendar.authz: not archived). Only the owner's own items
  become notes (a note is its own container), and only the owner converts a note; a shared note is not converted (its
  shares would point at nothing). A repeating event, or a changed occurrence of one, is not converted.
- A row of the target kind left in a container the user cannot change (converted there by someone else) answers 409.
"""

from __future__ import annotations

import uuid
from dataclasses import dataclass
from datetime import UTC, date, datetime, time, timedelta
from typing import Any, Literal

from sqlalchemy import func, select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from haalendar.accounts.models import UserAccount
from haalendar.atoms.time.local_to_utc import UnknownTimeZoneError, zone
from haalendar.attachments.models import Attachment
from haalendar.errors import ProblemCode, ProblemError
from haalendar.logging import get_logger
from haalendar.planning import cards, events, notes
from haalendar.planning.models import (
    Card,
    CardAssignee,
    ChecklistItem,
    Comment,
    Event,
    Item,
    ItemLabel,
    Label,
    Link,
    Note,
    RecurrenceException,
    Reminder,
    Share,
)
from haalendar.planning.service import _calendar, _item, _note_owner_only, _writable
from haalendar.softdelete import new_batch

log = get_logger(__name__)

Kind = Literal["event", "note", "card"]
EVENT_HOURS = 1


@dataclass(frozen=True)
class ConvertRequest:
    target_kind: Kind
    version: int | None = None
    calendar_id: uuid.UUID | None = None
    start_date: date | None = None
    board_id: uuid.UUID | None = None
    column_id: uuid.UUID | None = None
    position: str | None = None
    undo: uuid.UUID | None = None
    title: str | None = None
    body: str | None = None
    body_given: bool = False


@dataclass(frozen=True)
class Converted:
    item_id: uuid.UUID
    kind: str
    version: int
    batch_id: uuid.UUID


def _invalid(message: str, field: str | None = None) -> ProblemError:
    errors = [{"pointer": f"/{field}", "detail": message}] if field else None
    return ProblemError(422, ProblemCode.VALIDATION_FAILED, message, errors=errors)


def _state(message: str) -> ProblemError:
    return ProblemError(409, ProblemCode.INVALID_STATE, message)


async def _user_zone(db: AsyncSession, user_id: uuid.UUID) -> str:
    owner = await db.get(UserAccount, user_id)
    tzid = owner.time_zone if owner else "UTC"
    try:
        zone(tzid)
    except UnknownTimeZoneError:
        return "UTC"
    return tzid


async def _checklist(db: AsyncSession, item_id: uuid.UUID) -> list[ChecklistItem]:
    rows = (
        await db.scalars(
            select(ChecklistItem).where(ChecklistItem.item_id == item_id, ChecklistItem.deleted_at.is_(None))
        )
    ).all()
    return sorted(rows, key=lambda row: (row.position, str(row.id)))


async def _refuse_source(
    db: AsyncSession, user_id: uuid.UUID, item: Item
) -> tuple[date | None, time | None, str | None]:
    """Checks the item may leave its kind; returns its date, time and an event's place."""
    if item.kind == "event":
        event = await db.get(Event, item.id)
        if event is None:
            raise _state("This event cannot be read")
        if event.rrule is not None:
            raise _invalid("A repeating event cannot be converted")
        changed_occurrence = await db.scalar(
            select(func.count())
            .select_from(RecurrenceException)
            .where(RecurrenceException.override_event_id == item.id, RecurrenceException.deleted_at.is_(None))
        )
        if changed_occurrence:
            raise _invalid("A changed occurrence of a repeating event cannot be converted")
        return event.start_date, None if event.all_day else event.start_time, event.location
    if item.kind == "note":
        _note_owner_only(item, user_id)
        shared = await db.scalar(
            select(func.count())
            .select_from(Share)
            .where(Share.container_kind == "note", Share.container_id == item.id, Share.revoked_at.is_(None))
        )
        if shared:
            raise _state("Stop sharing the note first")
        note = await db.get(Note, item.id)
        return (note.due_date, note.due_time, None) if note else (None, None, None)
    card = await db.get(Card, item.id)
    return (card.due_date, card.due_time, None) if card else (None, None, None)


async def _place(
    db: AsyncSession, user_id: uuid.UUID, item: Item, request: ConvertRequest
) -> tuple[str, uuid.UUID]:
    """The container the item goes to, checked (write access, a live column)."""
    target = request.target_kind
    if target == "note":
        if item.owner_id != user_id:
            raise ProblemError(403, ProblemCode.FORBIDDEN, "Only your own items become notes")
        return "note", item.id
    if request.undo is not None:
        if target == "event":
            event = await db.get(Event, item.id)
            if event is None:
                raise _invalid("Nothing to undo")
            await _writable(db, user_id, "calendar", event.container_id)
            return "calendar", event.container_id
        card = await db.get(Card, item.id)
        if card is None:
            raise _invalid("Nothing to undo")
        await _writable(db, user_id, "board", card.board_id)
        await cards.live_column(db, card.board_id, card.column_id)
        return "board", card.board_id
    if target == "event":
        if request.calendar_id is None:
            raise _invalid("Choose a calendar", "calendar_id")
        await _calendar(db, request.calendar_id)
        await _writable(db, user_id, "calendar", request.calendar_id)
        return "calendar", request.calendar_id
    if request.board_id is None or request.column_id is None:
        raise _invalid("Choose a board and a column", "column_id")
    await _writable(db, user_id, "board", request.board_id)
    await cards.live_column(db, request.board_id, request.column_id)
    return "board", request.board_id


def _body(body: str | None, location: str | None, checklist: list[ChecklistItem] | None) -> str | None:
    parts = []
    if location:
        parts.append(f"Location: {location}")
    if body:
        parts.append(body)
    if checklist:
        parts.append("\n".join(f"- [{'x' if row.checked else ' '}] {row.text}" for row in checklist))
    return "\n\n".join(parts) if parts else body


def _title(target: str, title: str) -> str:
    if target == "event":
        return events.title_of(title[: events.TITLE_MAX])
    if target == "card":
        return title.strip() or events.NO_TITLE
    return title.strip()


def _event_values(day: date, at: time | None, tzid: str) -> dict[str, Any]:
    if at is None:
        state: dict[str, Any] = {"all_day": True, "start_date": day.isoformat(), "end_date": day.isoformat()}
        state.update({"start_time": None, "end_time": None})
    else:
        end = datetime.combine(day, at) + timedelta(hours=EVENT_HOURS)
        state = {
            "all_day": False,
            "start_date": day.isoformat(),
            "start_time": at.strftime("%H:%M"),
            "end_date": end.date().isoformat(),
            "end_time": end.strftime("%H:%M"),
        }
    return events.checked({**state, "tzid": tzid, "rrule": None, "location": None})


async def _add_row(db: AsyncSession, row: Event | Note | Card, kind: str) -> None:
    """Adds the details row of the new kind; one left by an earlier conversion out of the user's reach answers 409."""
    try:
        async with db.begin_nested():
            db.add(row)
            await db.flush()
    except IntegrityError:
        article = "an" if kind == "event" else "a"
        raise _state(
            f"It was {article} {kind} somewhere you cannot change, so it cannot become one again"
        ) from None


async def _details(
    db: AsyncSession,
    user_id: uuid.UUID,
    item: Item,
    request: ConvertRequest,
    dated: tuple[date | None, time | None],
    has_checklist: bool,
) -> None:
    """Writes the details row of the new kind (made anew, or as it was for an undo)."""
    target, (day, at) = request.target_kind, dated
    if target == "event":
        event = await db.get(Event, item.id)
        if request.undo is not None and event is not None:
            return
        tzid = await _user_zone(db, user_id)
        today = datetime.now(UTC).astimezone(zone(tzid)).date()
        values = _event_values(day or request.start_date or today, at, tzid)
        if event is None:
            event = Event(id=item.id, container_kind="calendar", container_id=item.container_id)
            events.apply(event, values)
            await _add_row(db, event, "event")
            return
        event.container_id = item.container_id
        event.ics_uid = None
        events.apply(event, values)
        return
    if target == "note":
        note = await db.get(Note, item.id)
        if request.undo is not None and note is not None:
            return
        if request.position is None:
            raise _invalid("Required", "position")
        position = notes.checked_position(request.position)
        if note is None:
            note = Note(id=item.id, container_kind="note", container_id=item.id, position=position)
            note.pinned, note.archived_at, note.is_checklist = False, None, has_checklist
            note.due_date, note.due_time = day, at
            await _add_row(db, note, "note")
            return
        note.position, note.pinned, note.archived_at, note.is_checklist = position, False, None, has_checklist
        note.due_date, note.due_time = day, at
        return
    card = await db.get(Card, item.id)
    if request.undo is not None and card is not None:
        return
    if request.position is None or request.column_id is None:
        raise _invalid("Required", "position")
    position = notes.checked_position(request.position)
    if card is None:
        card = Card(
            id=item.id,
            container_kind="board",
            container_id=item.container_id,
            board_id=item.container_id,
            column_id=request.column_id,
            position=position,
            due_date=day,
            due_time=at,
        )
        await _add_row(db, card, "card")
        return
    card.container_id = card.board_id = item.container_id
    card.column_id, card.position, card.due_date, card.due_time = request.column_id, position, day, at


async def _take(
    db: AsyncSession, model: Any, item_id: uuid.UUID, user_id: uuid.UUID, batch: uuid.UUID
) -> None:
    """Soft-deletes the live rows of `model` on the item into the conversion's batch."""
    await db.execute(
        update(model)
        .where(model.item_id == item_id, model.deleted_at.is_(None))
        .values(
            deleted_at=datetime.now(UTC), delete_batch_id=batch, updated_by=user_id, version=model.version + 1
        )
        .execution_options(synchronize_session=False)
    )


async def _give_back(db: AsyncSession, item_id: uuid.UUID, user_id: uuid.UUID, batch: uuid.UUID) -> None:
    """Undo: the rows a conversion took come back (only this item's, only that batch)."""
    for model in (ChecklistItem, ItemLabel, CardAssignee, Comment):
        await db.execute(
            update(model)
            .where(model.item_id == item_id, model.delete_batch_id == batch, model.deleted_at.is_not(None))
            .values(deleted_at=None, delete_batch_id=None, updated_by=user_id, version=model.version + 1)
            .execution_options(synchronize_session=False)
        )
    await db.execute(
        update(Reminder)
        .where(
            Reminder.item_id == item_id,
            Reminder.owner_id == user_id,
            Reminder.delete_batch_id == batch,
            Reminder.deleted_at.is_not(None),
        )
        .values(deleted_at=None, delete_batch_id=None, version=Reminder.version + 1)
        .execution_options(synchronize_session=False)
    )


async def _labels(db: AsyncSession, user_id: uuid.UUID, item: Item, batch: uuid.UUID, mapped: bool) -> None:
    """Labels go to the label of the same name where the item goes (board labels for a card, the user's own for a
    note); the others are taken. For an undo none are mapped: the batch brings the earlier ones back."""
    rows = (
        await db.scalars(
            select(ItemLabel).where(ItemLabel.item_id == item.id, ItemLabel.deleted_at.is_(None))
        )
    ).all()
    names = []
    for row in rows:
        label = await db.get(Label, row.label_id)
        if label is not None and label.deleted_at is None:
            names.append(label.name.lower())
    await _take(db, ItemLabel, item.id, user_id, batch)
    if not mapped or item.kind == "event" or not names:
        return
    where = (
        Label.board_id == item.container_id
        if item.kind == "card"
        else (Label.board_id.is_(None)) & (Label.container_id == user_id)
    )
    targets = (
        await db.scalars(
            select(Label).where(where, Label.deleted_at.is_(None), func.lower(Label.name).in_(names))
        )
    ).all()
    for label in sorted(targets, key=lambda found: found.name.lower()):
        db.add(
            ItemLabel(
                item_id=item.id,
                label_id=label.id,
                container_kind=label.container_kind,
                container_id=label.container_id,
                created_by=user_id,
                updated_by=user_id,
            )
        )
    await db.flush()


async def _reminders(db: AsyncSession, user_id: uuid.UUID, item: Item, batch: uuid.UUID) -> None:
    """The user's own reminders of another form are taken (a note's is a date and time, the others count)."""
    other_form = Reminder.remind_at.is_(None) if item.kind == "note" else Reminder.remind_at.is_not(None)
    await db.execute(
        update(Reminder)
        .where(
            Reminder.item_id == item.id,
            Reminder.owner_id == user_id,
            Reminder.deleted_at.is_(None),
            other_form,
        )
        .values(deleted_at=datetime.now(UTC), delete_batch_id=batch, version=Reminder.version + 1)
        .execution_options(synchronize_session=False)
    )


async def _children(db: AsyncSession, item: Item, keeps_checklist: bool) -> None:
    """What stays with the item carries its new container (as when an event moves to another calendar)."""
    kind, container = item.container_kind, item.container_id
    statements = [
        update(Attachment)
        .where(Attachment.item_id == item.id)
        .values(container_kind=kind, container_id=container),
        update(Link).where(Link.from_item_id == item.id).values(container_kind=kind, container_id=container),
        update(Link)
        .where(Link.to_item_id == item.id)
        .values(to_container_kind=kind, to_container_id=container),
    ]
    if keeps_checklist:
        statements.append(
            update(ChecklistItem)
            .where(ChecklistItem.item_id == item.id)
            .values(container_kind=kind, container_id=container)
        )
    for statement in statements:
        await db.execute(statement.execution_options(synchronize_session=False))


async def convert_item(
    db: AsyncSession, user_id: uuid.UUID, item_id: uuid.UUID, request: ConvertRequest
) -> Converted:
    item = await _item(db, item_id)
    target = request.target_kind
    if item.deleted_at is not None:
        raise _state("It was deleted")
    await _writable(db, user_id, item.container_kind, item.container_id)
    if request.undo is None and (request.title is not None or request.body_given):
        raise _invalid("A title and a description are given with undo only", "title")
    if target == item.kind:
        if request.undo is not None:
            raise _invalid("It is a " + target + " already", "target_kind")
        # A repeated request (or one from a device that had not seen the change yet) changes nothing.
        return Converted(item.id, item.kind, item.version, new_batch())
    if request.version is not None and request.version != item.version:
        raise ProblemError(409, ProblemCode.VERSION_CONFLICT, "It changed on another device")
    source = item.kind
    day, at, location = await _refuse_source(db, user_id, item)
    container_kind, container_id = await _place(db, user_id, item, request)
    checklist = await _checklist(db, item.id)
    batch = new_batch()

    if request.undo is not None:
        title = request.title if request.title is not None else item.title
        body = request.body if request.body_given else item.body
    else:
        title = _title(target, item.title)
        body = _body(
            item.body, location if target != "event" else None, checklist if target == "event" else None
        )
    item.kind, item.container_kind, item.container_id = target, container_kind, container_id
    item.title, item.body = title, body
    item.version += 1
    item.updated_by = user_id
    await db.flush()

    await _details(db, user_id, item, request, (day, at), bool(checklist))
    await _children(db, item, keeps_checklist=target != "event")
    if target == "event":
        await _take(db, ChecklistItem, item.id, user_id, batch)
    if source == "card":
        await _take(db, CardAssignee, item.id, user_id, batch)
        await _take(db, Comment, item.id, user_id, batch)
    await _labels(db, user_id, item, batch, mapped=request.undo is None)
    await _reminders(db, user_id, item, batch)
    if request.undo is not None:
        await _give_back(db, item.id, user_id, request.undo)
    await db.flush()
    log.info(
        "item_converted",
        item_id=str(item.id),
        source=source,
        target=target,
        undo=request.undo is not None,
        batch_id=str(batch),
        user_id=str(user_id),
    )
    return Converted(item.id, item.kind, item.version, batch)
