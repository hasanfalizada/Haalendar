"""Single occurrences of a series (FR-CAL-11..14, F-21..F-23, D-67).

+++===+++ 2026-10-23 — Hasan Alizada — HAAL-067.
- `exclude`: the date leaves the series ("cancelled"), or is replaced by a one-off event made from it ("overridden",
  that event's id given). The date must be an occurrence of the series; excluding it again changes nothing.
- `include`: the exception of that date is soft-deleted (undo of an exclude); the date comes back.
- Both need write access to the calendar and raise the series' version, so every device pulls the new list of
  exceptions (it travels with the event's fields as `exceptions`). Nothing is ever removed: exceptions stay in the
  table, an included one is only marked deleted.
- `effective_start`: the first occurrence that is not excluded — where the series starts for the user once its first
  dates are excluded (F-23). Derived only; the stored start date and the exceptions are kept.
"""

from __future__ import annotations

import uuid
from datetime import UTC, date, datetime, timedelta
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from haalendar.atoms.calendar.recurrence import MAX_WINDOW_DAYS, occurrences
from haalendar.authz import require
from haalendar.errors import ProblemCode, ProblemError
from haalendar.logging import get_logger
from haalendar.planning.models import Event, Item, RecurrenceException
from haalendar.softdelete import new_batch

log = get_logger(__name__)

# How far effective_start looks ahead: whole windows of the recurrence atom (a daily series with more excluded leading
# days than this keeps its stored start).
_LOOKAHEAD_WINDOWS = 5


def _invalid(message: str) -> ProblemError:
    return ProblemError(422, ProblemCode.VALIDATION_FAILED, message)


def is_occurrence(event: Event, day: date) -> bool:
    if event.rrule is None:
        return False
    return occurrences(
        start_date=event.start_date, rrule=event.rrule, exceptions=(), window_from=day, window_to=day
    ) == [day]


def effective_start(start: date, rrule: str | None, exceptions: set[date]) -> date:
    if rrule is None or not exceptions:
        return start
    window_from = start
    for _ in range(_LOOKAHEAD_WINDOWS):
        window_to = window_from + timedelta(days=MAX_WINDOW_DAYS)
        found = occurrences(
            start_date=start, rrule=rrule, exceptions=exceptions, window_from=window_from, window_to=window_to
        )
        if found:
            return found[0]
        window_from = window_to + timedelta(days=1)
    return start


async def _series(
    db: AsyncSession, user_id: uuid.UUID, item_id: uuid.UUID, current: dict[str, Any]
) -> tuple[Item, Event]:
    item = await db.get(Item, item_id)
    if item is None:
        raise ProblemError(404, ProblemCode.NOT_FOUND, "Not found")
    await require(db, user_id, "write_items", "calendar", item.container_id)
    if item.deleted_at is not None:
        raise ProblemError(
            409, ProblemCode.INVALID_STATE, "It was deleted on another device", current=current
        )
    event = await db.get(Event, item_id) if item.kind == "event" else None
    if event is None or event.rrule is None:
        raise _invalid("Only a repeating event has occurrences")
    return item, event


async def _active(db: AsyncSession, event_id: uuid.UUID, day: date) -> RecurrenceException | None:
    found: RecurrenceException | None = await db.scalar(
        select(RecurrenceException).where(
            RecurrenceException.event_id == event_id,
            RecurrenceException.occurrence_date == day,
            RecurrenceException.deleted_at.is_(None),
        )
    )
    return found


def _bump(item: Item, user_id: uuid.UUID) -> None:
    item.version += 1
    item.updated_by = user_id


async def exclude(
    db: AsyncSession,
    user_id: uuid.UUID,
    item_id: uuid.UUID,
    day: date,
    override_id: uuid.UUID | None,
    current: dict[str, Any],
) -> int:
    item, event = await _series(db, user_id, item_id, current)
    if not is_occurrence(event, day):
        raise _invalid("This date is not an occurrence of the series")
    if override_id is not None:
        override = await db.get(Event, override_id)
        if override is None or override.rrule is not None or override.container_id != event.container_id:
            raise _invalid("The replacing event must be a one-off event in the same calendar")
    if await _active(db, event.id, day) is None:
        db.add(
            RecurrenceException(
                event_id=event.id,
                container_kind="calendar",
                container_id=event.container_id,
                occurrence_date=day,
                kind="overridden" if override_id is not None else "cancelled",
                override_event_id=override_id,
                created_by=user_id,
            )
        )
        _bump(item, user_id)
        await db.flush()
        log.info(
            "occurrence_excluded",
            item_id=str(item_id),
            overridden=override_id is not None,
            user_id=str(user_id),
        )
    return item.version


async def include(
    db: AsyncSession, user_id: uuid.UUID, item_id: uuid.UUID, day: date, current: dict[str, Any]
) -> int:
    item, event = await _series(db, user_id, item_id, current)
    exception = await _active(db, event.id, day)
    if exception is not None:
        # The table has no updated_by (who did it is in the audit log): marked deleted like soft_delete does.
        exception.deleted_at, exception.delete_batch_id = datetime.now(UTC), new_batch()
        exception.version += 1
        _bump(item, user_id)
        await db.flush()
        log.info("occurrence_included", item_id=str(item_id), user_id=str(user_id))
    return item.version
