"""Reminders (FR-CAL-29, owner decision D-79): written through sync by their owner, fired by the worker.

+++===+++ 2026-10-28 — Hasan Alizada — HAAL-091.
- A reminder belongs to its owner and an event the owner can see (own calendar or shared, also for viewing only); up
  to MAX_PER_ITEM active ones per event and user. Exactly one form: "before" (offset_minutes) or "on the day"
  (all_day_time and all_day_days_before). Changing a reminder merges per field like other records; its event never
  changes. Delete and restore are soft (one batch per reminder).
- The worker (`check_reminders`, every minute) asks the database for the reminders to check or fire (ids only) and
  handles each as its owner, under row-level security: a reminder whose event is gone or out of reach gets no next
  fire; one marked "to check" gets its next fire computed from now; a due one writes a `reminder` notification (late
  when more than LATE_AFTER behind) and moves on to the next occurrence after now.
"""

from __future__ import annotations

import uuid
from datetime import UTC, date, datetime, time, timedelta
from typing import Any

from sqlalchemy import func, select, text
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from haalendar.accounts.models import UserAccount
from haalendar.deps import USER_ID_SETTING
from haalendar.errors import ProblemCode, ProblemError
from haalendar.logging import get_logger
from haalendar.notifications.service import notify_self
from haalendar.planning.models import Event, Item, RecurrenceException, Reminder, ReminderSchedule
from haalendar.planning.reminder_times import EventTimes, ReminderRule, next_fire
from haalendar.planning.service import Outcome, merge
from haalendar.softdelete import new_batch

log = get_logger(__name__)

MAX_PER_ITEM = 5
LATE_AFTER = timedelta(hours=1)
BATCH = 200
FORM_FIELDS = ("offset_minutes", "all_day_time", "all_day_days_before")
DUE = text("SELECT reminder_id, owner_id FROM haalendar_reminders_due(:at, :max_rows)")


def _invalid(message: str) -> ProblemError:
    return ProblemError(422, ProblemCode.VALIDATION_FAILED, message)


def _not_found() -> ProblemError:
    return ProblemError(404, ProblemCode.NOT_FOUND, "Not found")


def _parse_time(value: Any) -> time | None:
    if value is None or isinstance(value, time):
        return value
    try:
        return time.fromisoformat(str(value))
    except ValueError:
        raise _invalid("Use a time like 09:00") from None


def _form(values: dict[str, Any]) -> dict[str, Any]:
    """The reminder's form fields, checked: exactly one of the two forms."""
    form = {name: values.get(name) for name in FORM_FIELDS}
    form["all_day_time"] = _parse_time(form["all_day_time"])
    before = form["offset_minutes"] is not None
    on_day = form["all_day_time"] is not None or form["all_day_days_before"] is not None
    if before == on_day:
        raise _invalid("Choose minutes before, or a day and a time")
    if on_day and (form["all_day_time"] is None or form["all_day_days_before"] is None):
        raise _invalid("Choose a day and a time")
    return form


def state_of(reminder: Reminder) -> dict[str, Any]:
    return {
        "offset_minutes": reminder.offset_minutes,
        "all_day_time": reminder.all_day_time,
        "all_day_days_before": reminder.all_day_days_before,
    }


async def _own(db: AsyncSession, user_id: uuid.UUID, reminder_id: uuid.UUID) -> Reminder:
    reminder = await db.get(Reminder, reminder_id)
    if reminder is None or reminder.owner_id != user_id:  # row-level security hides other people's
        raise _not_found()
    return reminder


async def create_reminder(
    db: AsyncSession, user_id: uuid.UUID, reminder_id: uuid.UUID, data: dict[str, Any]
) -> Outcome:
    if await db.get(Reminder, reminder_id) is not None:
        raise ProblemError(409, ProblemCode.DUPLICATE, "A reminder with this id exists")
    item = await db.get(Item, uuid.UUID(str(data["item_id"])))
    if item is None or item.kind != "event":  # unknown, not readable, or not an event
        raise _not_found()
    if item.deleted_at is not None:
        raise ProblemError(409, ProblemCode.INVALID_STATE, "The event was deleted")
    active = await db.scalar(
        select(func.count())
        .select_from(Reminder)
        .where(Reminder.item_id == item.id, Reminder.owner_id == user_id, Reminder.deleted_at.is_(None))
    )
    if (active or 0) >= MAX_PER_ITEM:
        raise _invalid(f"At most {MAX_PER_ITEM} reminders per event")
    reminder = Reminder(id=reminder_id, item_id=item.id, owner_id=user_id, **_form(data))
    db.add(reminder)
    await db.flush()
    log.info("reminder_created", reminder_id=str(reminder_id), item_id=str(item.id), user_id=str(user_id))
    return Outcome(version=reminder.version)


async def update_reminder(
    db: AsyncSession,
    user_id: uuid.UUID,
    reminder_id: uuid.UUID,
    base: dict[str, Any],
    new: dict[str, Any],
    current_state: dict[str, Any],
) -> Outcome:
    reminder = await _own(db, user_id, reminder_id)
    if reminder.deleted_at is not None:
        raise ProblemError(
            409, ProblemCode.INVALID_STATE, "It was deleted on another device", current=current_state
        )
    normalize = {"all_day_time": _parse_time}
    new = {k: normalize.get(k, lambda v: v)(v) for k, v in new.items() if k in FORM_FIELDS}
    base = {k: normalize.get(k, lambda v: v)(v) for k, v in base.items() if k in FORM_FIELDS}
    apply, conflicts = merge(state_of(reminder), base, new)
    # A form is changed as a whole: a conflict on one of its fields keeps all of them.
    if conflicts:
        apply = {}
        conflicts = sorted(set(conflicts) | {name for name in new if name in FORM_FIELDS})
    if apply:
        form = _form({**state_of(reminder), **apply})
        for name, value in form.items():
            setattr(reminder, name, value)
        reminder.version += 1
        await db.flush()
    log.info("reminder_updated", reminder_id=str(reminder_id), fields=sorted(apply), conflicts=conflicts)
    return Outcome(version=reminder.version, conflicts=conflicts)


async def delete_reminder(db: AsyncSession, user_id: uuid.UUID, reminder_id: uuid.UUID) -> Outcome:
    reminder = await _own(db, user_id, reminder_id)
    if reminder.deleted_at is None:
        reminder.deleted_at, reminder.delete_batch_id = datetime.now(UTC), new_batch()
        reminder.version += 1
        await db.flush()
        log.info("reminder_deleted", reminder_id=str(reminder_id), user_id=str(user_id))
    return Outcome(version=reminder.version)


async def restore_reminder(db: AsyncSession, user_id: uuid.UUID, reminder_id: uuid.UUID) -> Outcome:
    reminder = await _own(db, user_id, reminder_id)
    if reminder.deleted_at is not None:
        reminder.deleted_at, reminder.delete_batch_id = None, None
        reminder.version += 1
        await db.flush()
        log.info("reminder_restored", reminder_id=str(reminder_id), user_id=str(user_id))
    return Outcome(version=reminder.version)


# ---- the worker ----


async def _event_times(db: AsyncSession, item: Item) -> tuple[Event, EventTimes] | None:
    event = await db.get(Event, item.id)
    if event is None:
        return None
    excluded = (
        await db.scalars(
            select(RecurrenceException.occurrence_date).where(
                RecurrenceException.event_id == event.id, RecurrenceException.deleted_at.is_(None)
            )
        )
    ).all()
    return event, EventTimes(
        all_day=event.all_day,
        start_date=event.start_date,
        start_time=event.start_time,
        tzid=event.tzid,
        rrule=event.rrule,
        exceptions=frozenset(excluded),
    )


def _payload(
    item: Item, event: Event, reminder: Reminder, occurrence: date, fire_at: datetime, late: bool
) -> dict[str, Any]:
    """Display data of a reminder notification; the client builds the text in the viewer's zone and language."""
    length = datetime.combine(event.end_date, event.end_time or time(0)) - datetime.combine(
        event.start_date, event.start_time or time(0)
    )
    end_date = occurrence + timedelta(days=(event.end_date - event.start_date).days)
    return {
        "reminder_id": str(reminder.id),
        "item_id": str(item.id),
        "title": item.title,
        "location": event.location,
        "all_day": event.all_day,
        "occurrence_date": occurrence.isoformat(),
        "end_date": end_date.isoformat(),
        "start_time": event.start_time.strftime("%H:%M") if event.start_time else None,
        "end_time": event.end_time.strftime("%H:%M") if event.end_time else None,
        "length_minutes": int(length.total_seconds() // 60),
        "tzid": event.tzid,
        "fire_at": fire_at.isoformat(),
        "late": late,
    }


async def handle(db: AsyncSession, reminder_id: uuid.UUID, now: datetime) -> str:
    """Check or fire one reminder as its owner (the caller has set the owner for the transaction)."""
    schedule = await db.get(ReminderSchedule, reminder_id)
    reminder = await db.get(Reminder, reminder_id)
    if schedule is None or reminder is None:
        return "missing"
    item = await db.get(Item, reminder.item_id)
    found = await _event_times(db, item) if item is not None and item.deleted_at is None else None
    owner = await db.get(UserAccount, reminder.owner_id)
    if reminder.deleted_at is not None or item is None or found is None or owner is None:
        schedule.next_fire_at, schedule.next_occurrence, schedule.needs_check = None, None, False
        return "idle"
    event, times = found
    rule = ReminderRule(reminder.offset_minutes, reminder.all_day_time, reminder.all_day_days_before)
    outcome = "checked"
    if not schedule.needs_check and schedule.next_fire_at is not None and schedule.next_fire_at <= now:
        occurrence = schedule.next_occurrence or times.start_date
        late = now - schedule.next_fire_at > LATE_AFTER
        await notify_self(
            db,
            reminder.owner_id,
            "reminder",
            _payload(item, event, reminder, occurrence, schedule.next_fire_at, late),
            item_id=item.id,
        )
        schedule.last_occurrence, schedule.last_fired_at = occurrence, now
        outcome = "fired_late" if late else "fired"
    following = next_fire(
        rule, times, owner.time_zone, after_occurrence=schedule.last_occurrence, not_before=now
    )
    schedule.next_fire_at = following.at if following else None
    schedule.next_occurrence = following.occurrence if following else None
    schedule.needs_check = False
    return outcome


async def check_reminders(
    factory: async_sessionmaker[AsyncSession], now: datetime | None = None
) -> dict[str, int]:
    """One round of the worker: every reminder to check or due, each in its own transaction as its owner."""
    at = now or datetime.now(UTC)
    async with factory() as db, db.begin():
        rows = (await db.execute(DUE, {"at": at, "max_rows": BATCH})).all()
    counts: dict[str, int] = {}
    for reminder_id, owner_id in rows:
        try:
            async with factory() as db, db.begin():
                await db.execute(select(func.set_config(USER_ID_SETTING, str(owner_id), True)))
                outcome = await handle(db, reminder_id, at)
        except Exception:
            log.exception("reminder_check_failed", reminder_id=str(reminder_id))
            outcome = "failed"
        counts[outcome] = counts.get(outcome, 0) + 1
    if rows:
        log.info("reminders_checked", **counts)
    return counts
