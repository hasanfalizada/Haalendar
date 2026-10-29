"""Reminders (FR-CAL-29, owner decision D-79): written through sync by their owner, fired by the worker.

+++===+++ 2026-10-28 — Hasan Alizada — HAAL-091.
- A reminder belongs to its owner and an event the owner can see (own calendar or shared, also for viewing only); up
  to MAX_PER_ITEM active ones per event and user. Exactly one form: "before" (offset_minutes) or "on the day"
  (all_day_time and all_day_days_before). Changing a reminder merges per field like other records; its event never
  changes. Delete and restore are soft (one batch per reminder).
- The worker (`check_reminders`, every minute) asks the database for the reminders to check or fire (ids only) and
  handles each as its owner, under row-level security: a reminder whose event is gone or out of reach gets no next
  fire; one marked "to check" gets its next fire computed from the start of the current minute (HAAL-172: a time
  in that minute counts as now and fires in the same round); a due one writes a `reminder` notification (late when
  more than LATE_AFTER behind) and moves on to the next occurrence after now.
- +++===+++ 2026-10-28 — Hasan Alizada — HAAL-091 (stage 2). A fired reminder that is not late also goes to the
  owner's browsers by Web Push, after its transaction has committed: "Reminder: Dentist" / "Today, 11:00-12:00 · Main
  St 1" in the owner's zone and 12/24-hour setting, opening the day with the event's card; the notification records
  when a browser was reached (delivered_push_at).
- +++===+++ 2026-10-29 — Hasan Alizada — HAAL-105. Reminders on notes (FR-TODO-07, D-89): a third form, `remind_at` (a
  date and time), the only one a note takes (an event keeps the other two). It fires once — a time already passed when
  it was set (to the minute) does not fire —, also for an archived note, never for a deleted one; editing the note
  marks its reminders "to check" but neither loses a due one nor fires it twice. Its notification and Web Push
  name the note and open it on the To-Do page.
"""

from __future__ import annotations

import uuid
from datetime import UTC, date, datetime, time, timedelta
from typing import Any
from zoneinfo import ZoneInfo

from sqlalchemy import func, select, text
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from haalendar.accounts.models import UserAccount
from haalendar.atoms.time.local_to_utc import local_to_utc
from haalendar.config import Settings
from haalendar.deps import USER_ID_SETTING
from haalendar.errors import ProblemCode, ProblemError
from haalendar.logging import get_logger
from haalendar.notifications.models import Notification
from haalendar.notifications.service import notify_self
from haalendar.planning.models import Calendar, Event, Item, RecurrenceException, Reminder, ReminderSchedule
from haalendar.planning.reminder_times import EventTimes, ReminderRule, next_fire
from haalendar.planning.service import Outcome, merge
from haalendar.preferences.models import UserSettings
from haalendar.push import service as push
from haalendar.softdelete import new_batch

log = get_logger(__name__)

MAX_PER_ITEM = 5
LATE_AFTER = timedelta(hours=1)
BATCH = 200
FORM_FIELDS = ("offset_minutes", "all_day_time", "all_day_days_before", "remind_at")
DUE = text("SELECT reminder_id, owner_id FROM haalendar_reminders_due(:at, :max_rows)")


async def _push(
    factory: async_sessionmaker[AsyncSession],
    settings: Settings,
    owner_id: uuid.UUID,
    message: dict[str, Any],
) -> None:
    """Web Push of a fired reminder; a failure is logged and never stops the round."""
    try:
        reached = await push.deliver(factory, settings, owner_id, message)
        if reached:
            async with factory() as db, db.begin():
                await db.execute(select(func.set_config(USER_ID_SETTING, str(owner_id), True)))
                note = await db.get(Notification, uuid.UUID(str(message["notification_id"])))
                if note is not None:
                    note.delivered_push_at = datetime.now(UTC)
    except Exception:
        log.exception("reminder_push_failed", user_id=str(owner_id))


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


def _parse_moment(value: Any) -> datetime | None:
    if value is None:
        return None
    try:
        moment = value if isinstance(value, datetime) else datetime.fromisoformat(str(value))
    except ValueError:
        raise _invalid("Use a date and time") from None
    if moment.tzinfo is None:
        raise _invalid("Use a date and time with its zone")
    return moment.astimezone(UTC).replace(second=0, microsecond=0)


def _form(values: dict[str, Any], kind: str) -> dict[str, Any]:
    """The reminder's form fields, checked: a note takes a date and time, an event one of its two forms."""
    form = {name: values.get(name) for name in FORM_FIELDS}
    form["all_day_time"] = _parse_time(form["all_day_time"])
    form["remind_at"] = _parse_moment(form["remind_at"])
    before = form["offset_minutes"] is not None
    on_day = form["all_day_time"] is not None or form["all_day_days_before"] is not None
    if kind == "note":
        if before or on_day or form["remind_at"] is None:
            raise _invalid("Choose a date and a time")
        return form
    if form["remind_at"] is not None:
        raise _invalid("Choose minutes before, or a day and a time")
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
        "remind_at": reminder.remind_at,
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
    if item is None or item.kind not in (
        "event",
        "note",
    ):  # unknown, not readable, or a kind without reminders
        raise _not_found()
    if item.deleted_at is not None:
        raise ProblemError(409, ProblemCode.INVALID_STATE, f"The {item.kind} was deleted")
    active = await db.scalar(
        select(func.count())
        .select_from(Reminder)
        .where(Reminder.item_id == item.id, Reminder.owner_id == user_id, Reminder.deleted_at.is_(None))
    )
    if (active or 0) >= MAX_PER_ITEM:
        raise _invalid(f"At most {MAX_PER_ITEM} reminders per {item.kind}")
    reminder = Reminder(id=reminder_id, item_id=item.id, owner_id=user_id, **_form(data, item.kind))
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
    normalize = {"all_day_time": _parse_time, "remind_at": _parse_moment}
    new = {k: normalize.get(k, lambda v: v)(v) for k, v in new.items() if k in FORM_FIELDS}
    base = {k: normalize.get(k, lambda v: v)(v) for k, v in base.items() if k in FORM_FIELDS}
    apply, conflicts = merge(state_of(reminder), base, new)
    # A form is changed as a whole: a conflict on one of its fields keeps all of them.
    if conflicts:
        apply = {}
        conflicts = sorted(set(conflicts) | {name for name in new if name in FORM_FIELDS})
    if apply:
        item = await db.get(Item, reminder.item_id)
        form = _form({**state_of(reminder), **apply}, item.kind if item is not None else "event")
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
        "kind": "event",
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


def _note_payload(item: Item, reminder: Reminder, fire_at: datetime, late: bool) -> dict[str, Any]:
    """Display data of a note's reminder notification."""
    return {
        "reminder_id": str(reminder.id),
        "item_id": str(item.id),
        "kind": "note",
        "title": item.title,
        "fire_at": fire_at.isoformat(),
        "late": late,
    }


def _clock(value: time, twelve_hours: bool) -> str:
    if not twelve_hours:
        return value.strftime("%H:%M")
    return f"{value.hour % 12 or 12}:{value.minute:02d} {'AM' if value.hour < 12 else 'PM'}"


def push_message(
    payload: dict[str, Any], notification_id: uuid.UUID, owner_tz: str, twelve_hours: bool, now: datetime
) -> dict[str, Any]:
    """The system notification of a fired reminder, in the owner's zone (English, like the server's e-mails)."""
    zone = ZoneInfo(owner_tz)
    if payload.get("kind") == "note":
        return _note_push(payload, notification_id, zone, twelve_hours, now)
    occurrence = date.fromisoformat(str(payload["occurrence_date"]))
    times = ""
    day = occurrence
    if not payload["all_day"] and payload["start_time"]:
        start = local_to_utc(
            occurrence, time.fromisoformat(str(payload["start_time"])), str(payload["tzid"])
        ).utc
        end = start + timedelta(minutes=int(payload["length_minutes"]))
        local_start, local_end = start.astimezone(zone), end.astimezone(zone)
        day = local_start.date()
        times = _clock(local_start.time(), twelve_hours)
        if end > start:
            times += "\u2013" + _clock(local_end.time(), twelve_hours)  # en dash
    today = now.astimezone(zone).date()
    when = (
        "Today"
        if day == today
        else "Tomorrow"
        if day == today + timedelta(days=1)
        else day.strftime("%a, %b %-d")
    )
    body = ", ".join(part for part in (when, times) if part)
    if payload.get("location"):
        body += f" · {payload['location']}"
    return {
        "type": "reminder",
        "title": f"Reminder: {payload['title'] or '(No title)'}",
        "body": body,
        "url": f"/calendar?date={day.isoformat()}&view=day&event={payload['item_id']}",
        "tag": f"reminder:{payload['reminder_id']}:{payload['occurrence_date']}",
        "notification_id": str(notification_id),
    }


def _when(day: date, today: date) -> str:
    return (
        "Today"
        if day == today
        else "Tomorrow"
        if day == today + timedelta(days=1)
        else day.strftime("%a, %b %-d")
    )


def _note_push(
    payload: dict[str, Any], notification_id: uuid.UUID, zone: ZoneInfo, twelve_hours: bool, now: datetime
) -> dict[str, Any]:
    fire_at = datetime.fromisoformat(str(payload["fire_at"])).astimezone(zone)
    body = f"{_when(fire_at.date(), now.astimezone(zone).date())}, {_clock(fire_at.time(), twelve_hours)}"
    return {
        "type": "reminder",
        "title": f"Reminder: {payload['title'] or 'Untitled note'}",
        "body": body,
        "url": f"/todo?note={payload['item_id']}",
        "tag": f"reminder:{payload['reminder_id']}:{payload['fire_at']}",
        "notification_id": str(notification_id),
    }


async def _handle_note(
    db: AsyncSession, schedule: ReminderSchedule, reminder: Reminder, item: Item | None, now: datetime
) -> tuple[str, dict[str, Any] | None]:
    """A note's reminder: fires once at its time (an archived note too, a deleted one never)."""
    owner = await db.get(UserAccount, reminder.owner_id)
    at = reminder.remind_at
    if (
        reminder.deleted_at is not None
        or item is None
        or item.deleted_at is not None
        or owner is None
        or at is None
    ):
        schedule.next_fire_at, schedule.next_occurrence, schedule.needs_check = None, None, False
        return "idle", None
    outcome = "checked"
    message: dict[str, Any] | None = None
    # Fired already at or after the time set now (an edit of the note asks for a check, but changes nothing here; a
    # later time set afterwards fires again).
    fired = schedule.last_fired_at is not None and schedule.last_fired_at >= at
    # "Already passed when set" is judged against the moment it was set (to the minute), not the moment of the check:
    # the first check may come only when the time has just been reached.
    passed_when_set = at < reminder.updated_at.replace(second=0, microsecond=0)
    if at <= now and not fired and not passed_when_set:
        late = now - at > LATE_AFTER
        payload = _note_payload(item, reminder, at, late)
        note = await notify_self(db, reminder.owner_id, "reminder", payload, item_id=item.id)
        if not late:
            prefs = await db.get(UserSettings, reminder.owner_id)
            twelve = prefs is not None and prefs.time_format == "12h"
            message = push_message(payload, note.id, owner.time_zone, twelve, now)
        schedule.last_fired_at = now
        outcome = "fired_late" if late else "fired"
        schedule.next_fire_at = None
    else:
        schedule.next_fire_at = at if at > now and not fired else None
    schedule.next_occurrence = None
    schedule.needs_check = False
    return outcome, message


async def handle(db: AsyncSession, reminder_id: uuid.UUID, now: datetime) -> str:
    """Check or fire one reminder as its owner (the caller has set the owner for the transaction)."""
    outcome, _message = await handle_with_push(db, reminder_id, now)
    return outcome


async def handle_with_push(
    db: AsyncSession, reminder_id: uuid.UUID, now: datetime
) -> tuple[str, dict[str, Any] | None]:
    """handle(), and the Web Push message of a reminder that fired on time (None otherwise)."""
    schedule = await db.get(ReminderSchedule, reminder_id)
    reminder = await db.get(Reminder, reminder_id)
    if schedule is None or reminder is None:
        return "missing", None
    item = await db.get(Item, reminder.item_id)
    if item is not None and item.kind == "note":
        return await _handle_note(db, schedule, reminder, item, now)
    # +++===+++ 2026-10-29 — Hasan Alizada — HAAL-094. An archived calendar's reminders do not fire (D-82).
    calendar = (
        await db.get(Calendar, item.container_id)
        if item is not None and item.container_kind == "calendar"
        else None
    )
    live = item is not None and item.deleted_at is None and (calendar is None or calendar.archived_at is None)
    found = await _event_times(db, item) if item is not None and live else None
    owner = await db.get(UserAccount, reminder.owner_id)
    if reminder.deleted_at is not None or item is None or found is None or owner is None:
        schedule.next_fire_at, schedule.next_occurrence, schedule.needs_check = None, None, False
        return "idle", None
    event, times = found
    rule = ReminderRule(reminder.offset_minutes, reminder.all_day_time, reminder.all_day_days_before)
    outcome = "checked"
    message: dict[str, Any] | None = None
    # +++===+++ 2026-10-29 — Hasan Alizada — HAAL-172. A reminder to check is computed from the start of this minute (the
    # worker runs once a minute): a time in this minute counts as now, so one set shortly before its time, or reached by
    # an edit of its event, is no longer taken for passed; if it is due, it fires in this same round.
    if schedule.needs_check:
        first = next_fire(
            rule,
            times,
            owner.time_zone,
            after_occurrence=schedule.last_occurrence,
            not_before=now.replace(second=0, microsecond=0),
        )
        schedule.next_fire_at = first.at if first else None
        schedule.next_occurrence = first.occurrence if first else None
        schedule.needs_check = False
    if schedule.next_fire_at is not None and schedule.next_fire_at <= now:
        occurrence = schedule.next_occurrence or times.start_date
        late = now - schedule.next_fire_at > LATE_AFTER
        payload = _payload(item, event, reminder, occurrence, schedule.next_fire_at, late)
        note = await notify_self(db, reminder.owner_id, "reminder", payload, item_id=item.id)
        if not late:
            prefs = await db.get(UserSettings, reminder.owner_id)
            twelve = prefs is not None and prefs.time_format == "12h"
            message = push_message(payload, note.id, owner.time_zone, twelve, now)
        schedule.last_occurrence, schedule.last_fired_at = occurrence, now
        outcome = "fired_late" if late else "fired"
        following = next_fire(
            rule, times, owner.time_zone, after_occurrence=schedule.last_occurrence, not_before=now
        )
        schedule.next_fire_at = following.at if following else None
        schedule.next_occurrence = following.occurrence if following else None
    return outcome, message


async def check_reminders(
    factory: async_sessionmaker[AsyncSession], now: datetime | None = None, settings: Settings | None = None
) -> dict[str, int]:
    """One round of the worker: every reminder to check or due, each in its own transaction as its owner."""
    at = now or datetime.now(UTC)
    async with factory() as db, db.begin():
        rows = (await db.execute(DUE, {"at": at, "max_rows": BATCH})).all()
    counts: dict[str, int] = {}
    for reminder_id, owner_id in rows:
        message: dict[str, Any] | None = None
        try:
            async with factory() as db, db.begin():
                await db.execute(select(func.set_config(USER_ID_SETTING, str(owner_id), True)))
                outcome, message = await handle_with_push(db, reminder_id, at)
        except Exception:
            log.exception("reminder_check_failed", reminder_id=str(reminder_id))
            outcome = "failed"
        counts[outcome] = counts.get(outcome, 0) + 1
        if message is not None and settings is not None:
            await _push(factory, settings, owner_id, message)
    if rows:
        log.info("reminders_checked", **counts)
    return counts
