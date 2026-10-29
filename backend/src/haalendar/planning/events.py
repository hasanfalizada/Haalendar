"""Events: create and change the event details of an item (FR-CAL-06/07/10, domain model 5.5, owner decision D-60).

+++===+++ 2026-10-22 — Hasan Alizada — HAAL-066.
- An event is an item of kind `event` plus its `event` row (same id, the item's container copied). Both are written in
  one transaction; every change raises the item's version, so sync and live updates follow the item.
- Values travel as JSON text: dates "YYYY-MM-DD", times "HH:MM", so the base values a client sends compare exactly
  with the server's. The whole event is checked after every change (also after a field-level merge):
  end ≥ start; all-day without times, timed with both; RRULE supported by calendar.recurrence.v1; a series spans one
  day; title ≤ 150, empty → "(No title)"; location ≤ 500; a known IANA zone (default: the owner's profile zone).
  +++===+++ 2026-10-29 — Hasan Alizada — HAAL-092. The rule is checked with calendar.recurrence.v2 (FR-CAL-30, D-80):
  inside its subset, and the start date must be an occurrence of it (e.g. a weekday the rule names, not after UNTIL).
- The time fields (all_day, dates, times, zone, rule) merge as one group: a conflict on one of them makes all changed
  ones of the group conflicts, so two devices can never combine into an event neither of them meant.
- start_utc / end_utc are derived for timed events from the first occurrence (time.local_to_utc.v1); all-day events
  have none.
"""

from __future__ import annotations

import uuid
from datetime import date, datetime, time
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from haalendar.accounts.models import UserAccount
from haalendar.atoms.calendar.recurrence import (
    StartNotInRuleError,
    UnsupportedRruleError,
    check,
    is_supported,
)
from haalendar.atoms.time.local_to_utc import UnknownTimeZoneError, local_to_utc, zone
from haalendar.errors import ProblemCode, ProblemError
from haalendar.logging import get_logger
from haalendar.planning.models import Event, Item

log = get_logger(__name__)

TIME_GROUP = ("all_day", "start_date", "start_time", "end_date", "end_time", "tzid", "rrule")
EVENT_FIELDS = (*TIME_GROUP, "location")
NO_TITLE = "(No title)"
TITLE_MAX = 150
LOCATION_MAX = 500


def _problem(errors: list[dict[str, str]]) -> ProblemError:
    return ProblemError(422, ProblemCode.VALIDATION_FAILED, "Invalid event", errors=errors)


def _time_text(value: time | None) -> str | None:
    return value.strftime("%H:%M") if value is not None else None


def state_of(event: Event) -> dict[str, Any]:
    """The event fields as JSON text (the form pull sends and clients send back as base values)."""
    return {
        "all_day": event.all_day,
        "start_date": event.start_date.isoformat(),
        "start_time": _time_text(event.start_time),
        "end_date": event.end_date.isoformat(),
        "end_time": _time_text(event.end_time),
        "tzid": event.tzid,
        "rrule": event.rrule,
        "location": event.location,
    }


def normalize(values: dict[str, Any]) -> dict[str, Any]:
    """Incoming values in the canonical text form ("HH:MM:SS" → "HH:MM"); unknown types are left for the check."""
    out = dict(values)
    for name in ("start_time", "end_time"):
        value = out.get(name)
        if isinstance(value, str) and len(value) == 8 and value.endswith(":00"):
            out[name] = value[:5]
    return out


def _date(state: dict[str, Any], name: str, errors: list[dict[str, str]]) -> date | None:
    value = state.get(name)
    if isinstance(value, str) and len(value) == 10:
        try:
            return date.fromisoformat(value)
        except ValueError:
            pass
    errors.append({"pointer": f"/data/{name}", "detail": "Enter a date (YYYY-MM-DD)"})
    return None


def _time(state: dict[str, Any], name: str, errors: list[dict[str, str]]) -> time | None:
    value = state.get(name)
    if value is None:
        return None
    try:
        if isinstance(value, str) and len(value) == 5:
            return time.fromisoformat(value)
    except ValueError:
        pass
    errors.append({"pointer": f"/data/{name}", "detail": "Enter a time (HH:MM)"})
    return None


def checked(state: dict[str, Any]) -> dict[str, Any]:
    """The whole event checked; returns typed column values or raises 422 with field errors."""
    errors: list[dict[str, str]] = []
    all_day = state.get("all_day")
    if not isinstance(all_day, bool):
        errors.append({"pointer": "/data/all_day", "detail": "Choose whether the event lasts all day"})
        all_day = True
    start_date, end_date = _date(state, "start_date", errors), _date(state, "end_date", errors)
    start_time, end_time = _time(state, "start_time", errors), _time(state, "end_time", errors)
    tzid, rrule, location = state.get("tzid"), state.get("rrule"), state.get("location")
    if all_day and (start_time is not None or end_time is not None):
        errors.append({"pointer": "/data/start_time", "detail": "An all-day event has no times"})
    if not all_day and (start_time is None or end_time is None):
        errors.append({"pointer": "/data/start_time", "detail": "Enter a start and an end time"})
    if start_date and end_date:
        start = datetime.combine(start_date, start_time or time.min)
        end = datetime.combine(end_date, end_time or time.min)
        if end_date < start_date or (not all_day and end < start):
            errors.append({"pointer": "/data/end_date", "detail": "The end cannot be before the start"})
    if not isinstance(tzid, str) or not tzid:
        errors.append({"pointer": "/data/tzid", "detail": "Unknown time zone"})
    else:
        try:
            zone(tzid)
        except UnknownTimeZoneError:
            errors.append({"pointer": "/data/tzid", "detail": "Unknown time zone"})
    if rrule is not None and not isinstance(rrule, str):
        errors.append({"pointer": "/data/rrule", "detail": "This repeat rule is not supported"})
    elif rrule is not None:
        try:
            if start_date:
                check(start_date, rrule)
            elif not is_supported(rrule):
                raise UnsupportedRruleError("unsupported RRULE")
        except UnsupportedRruleError:
            errors.append({"pointer": "/data/rrule", "detail": "This repeat rule is not supported"})
        except StartNotInRuleError:
            errors.append(
                {"pointer": "/data/rrule", "detail": "The start date is not one of the repeat dates"}
            )
        if start_date and end_date and end_date != start_date:
            errors.append({"pointer": "/data/end_date", "detail": "A repeating event lasts one day"})
    if location is not None and (not isinstance(location, str) or len(location) > LOCATION_MAX):
        errors.append({"pointer": "/data/location", "detail": f"At most {LOCATION_MAX} characters"})
    if errors:
        raise _problem(errors)
    return {
        "all_day": all_day,
        "start_date": start_date,
        "start_time": start_time,
        "end_date": end_date,
        "end_time": end_time,
        "tzid": tzid,
        "rrule": rrule,
        "location": location or None,
    }


def _derive_utc(event: Event) -> None:
    if event.all_day or event.start_time is None or event.end_time is None:
        event.start_utc = event.end_utc = None
        return
    event.start_utc = local_to_utc(event.start_date, event.start_time, event.tzid).utc
    event.end_utc = local_to_utc(event.end_date, event.end_time, event.tzid).utc


def title_of(value: Any) -> str:
    if value is None:
        return NO_TITLE
    if not isinstance(value, str) or len(value) > TITLE_MAX:
        raise _problem([{"pointer": "/data/title", "detail": f"At most {TITLE_MAX} characters"}])
    return value.strip() or NO_TITLE


def apply(event: Event, values: dict[str, Any]) -> None:
    for name, value in values.items():
        setattr(event, name, value)
    _derive_utc(event)


async def create_event(
    db: AsyncSession,
    user_id: uuid.UUID,
    item_id: uuid.UUID,
    container_id: uuid.UUID,
    item_values: dict[str, Any],
    event_values: dict[str, Any],
) -> int:
    """Creates the item and its event row; returns the version. Rights were checked by the caller."""
    if await db.get(Item, item_id) is not None:
        raise ProblemError(409, ProblemCode.DUPLICATE, "An item with this id exists")
    if "tzid" not in event_values:
        owner = await db.get(UserAccount, user_id)
        event_values = {**event_values, "tzid": owner.time_zone if owner else "UTC"}
    state = {"all_day": True, "start_time": None, "end_time": None, "rrule": None, "location": None}
    state.update(normalize(event_values))
    state.setdefault("end_date", state.get("start_date"))
    values = checked(state)
    item = Item(
        id=item_id,
        kind="event",
        owner_id=user_id,
        container_kind="calendar",
        container_id=container_id,
        title=title_of(item_values.get("title")),
        body=item_values.get("body"),
        color=item_values.get("color") or "brown",
        priority=item_values.get("priority") or "medium",
        created_by=user_id,
        updated_by=user_id,
    )
    db.add(item)
    await db.flush()
    event = Event(id=item_id, container_kind="calendar", container_id=container_id)
    apply(event, values)
    db.add(event)
    await db.flush()
    log.info(
        "event_created", item_id=str(item_id), recurring=values["rrule"] is not None, user_id=str(user_id)
    )
    return item.version


def group_conflicts(changed: list[str], conflicts: list[str]) -> list[str]:
    """A conflict on one time field makes every changed time field a conflict (the group stays as the server has it)."""
    if not any(name in TIME_GROUP for name in conflicts):
        return conflicts
    return sorted(set(conflicts) | {name for name in changed if name in TIME_GROUP})
