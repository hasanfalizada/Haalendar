"""iCalendar (RFC 5545) files of a calendar: reading an imported file, writing the export (FR-CAL-33, C-09, D-83).

+++===+++ 2026-10-29 — Hasan Alizada — HAAL-095. On the `icalendar` library (BSD-2-Clause): it unfolds and unescapes,
reads parameters, VTIMEZONE and DURATION; this module maps its events onto Haalendar's (pure, no database):
- SUMMARY → title (at most 150 characters, longer ones cut with a warning; empty → "(No title)"), DESCRIPTION → body,
  LOCATION → place (at most 500), PRIORITY 1-4 high, 6-9 low, else medium; the colour is the user's default;
- a DATE start is an all-day event, its DTEND exclusive (the last day is the day before); a DATE-TIME start with a
  TZID that names an IANA or a Windows zone keeps its wall-clock time in that zone; UTC, floating times and zones
  known only from the file's VTIMEZONE are converted to the user's zone; DURATION as well as DTEND; seconds dropped;
- RRULE into the supported subset (calendar.recurrence.v2): WKST=MO and a BYMONTH of the start's own month are dropped,
  a timed UNTIL becomes its date in the event's zone; a start the rule does not fit moves to the first occurrence
  after it (warning); anything else is not imported, with the reason; EXDATE → excluded dates; RDATE → one-off events;
- RECURRENCE-ID → a one-off event replacing that date of its series (cancelled ones only exclude the date);
- cancelled events are left out; VTODO / VJOURNAL are counted in a warning; reminders (VALARM) and attachments are not
  imported (warnings).
The export writes every live event of a calendar: the rule (UNTIL as the last moment of that day in UTC for timed
events, as RFC 5545 asks), EXDATE for every excluded date (a replaced date is its own event), VTIMEZONE for each zone
used, UID = the imported UID or `<id>@haalendar`.
"""

from __future__ import annotations

import uuid
import zoneinfo
from collections.abc import Iterable
from dataclasses import dataclass, field
from datetime import UTC, date, datetime, time, timedelta
from functools import cache
from typing import Any
from zoneinfo import ZoneInfo

import icalendar
from icalendar.timezone.windows_to_olson import WINDOWS_TO_OLSON

from haalendar.atoms.calendar.recurrence import (
    StartNotInRuleError,
    UnsupportedRruleError,
    check,
)
from haalendar.planning.events import LOCATION_MAX, TITLE_MAX

MAX_BYTES = 5 * 1024 * 1024
MAX_EVENTS = 5000
NO_TITLE = "(No title)"
# How far a start the rule does not fit may move to its first occurrence (a yearly 29 February: four years).
_MOVE_DAYS = 4 * 366

WEEKDAYS = ("MO", "TU", "WE", "TH", "FR", "SA", "SU")


class NotCalendarError(ValueError):
    """The file is not an iCalendar file."""


class Skip(Exception):
    """The event is left out; the message is the reason in the report."""


@dataclass
class Draft:
    """One event to create: the item fields as sync takes them, plus what belongs to it in the file."""

    uid: str | None
    title: str
    data: dict[str, Any]
    exdates: list[date] = field(default_factory=list)
    # A replaced occurrence: the date of its series it replaces.
    recurrence_of: date | None = None
    cancelled: bool = False


@dataclass
class Parsed:
    events: list[Draft] = field(default_factory=list)
    # Replaced or cancelled occurrences by the UID of their series, in file order.
    overrides: dict[str, list[Draft]] = field(default_factory=dict)
    skipped: list[tuple[str, str]] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)


# ---------------------------------------------------------------- time zones


@cache
def _known_zones() -> frozenset[str]:
    return frozenset(zoneinfo.available_timezones())


def iana_zone(tzid: str | None) -> str | None:
    """The IANA name for a TZID: itself, a Windows zone name, or a vendor-prefixed name ("/mozilla.org/…/Europe/Rome")."""
    if not tzid:
        return None
    cleaned = tzid.strip().strip('"').strip("/")
    if cleaned in _known_zones():
        return cleaned
    if cleaned in WINDOWS_TO_OLSON:
        return WINDOWS_TO_OLSON[cleaned]
    parts = cleaned.split("/")
    for begin in range(1, len(parts)):
        candidate = "/".join(parts[begin:])
        if candidate in _known_zones():
            return candidate
    return None


@dataclass(frozen=True)
class _Moment:
    """A start or end: a date (all day) or a wall-clock time in `zone`."""

    value: date | datetime
    zone: str | None
    converted: bool = False


def _moment(component: icalendar.cal.Component, name: str, profile_zone: str) -> _Moment | None:
    if name not in component:
        return None
    value = component.decoded(name)
    if not isinstance(value, datetime):
        return _Moment(value, None) if isinstance(value, date) else None
    zone = iana_zone(component[name].params.get("TZID"))
    if zone is not None:
        return _Moment(value.replace(tzinfo=None), zone)
    if value.tzinfo is None:  # floating: the user's own clock
        return _Moment(value, profile_zone)
    local = value.astimezone(ZoneInfo(profile_zone)).replace(tzinfo=None)
    known = value.utcoffset() == timedelta(0) and str(value.tzinfo) in ("UTC", "tzutc()")
    return _Moment(local, profile_zone, converted=not known)


def _in_zone(value: date | datetime, zone: str) -> date:
    """The date of an UNTIL / EXDATE / RECURRENCE-ID value as seen in the event's zone."""
    if isinstance(value, datetime):
        return value.astimezone(ZoneInfo(zone)).date() if value.tzinfo is not None else value.date()
    return value


# ---------------------------------------------------------------- repeat rules


def _byday(value: str) -> str:
    value = value.upper().lstrip("+")
    return value


def map_rule(recur: Any, start: date, zone: str | None) -> str:
    """The RRULE in the supported subset (canonical order); raises Skip with the reason otherwise."""
    parts = {str(name).upper(): list(values) for name, values in dict(recur).items()}
    unsupported = Skip("Its repeat rule is not supported")
    freq = str(parts.pop("FREQ", [""])[0]).upper()
    if freq not in ("DAILY", "WEEKLY", "MONTHLY", "YEARLY"):
        raise unsupported
    interval = int(parts.pop("INTERVAL", [1])[0])
    wkst = [str(v).upper() for v in parts.pop("WKST", ["MO"])]
    byday = [_byday(str(v)) for v in parts.pop("BYDAY", [])]
    bymonthday = [int(v) for v in parts.pop("BYMONTHDAY", [])]
    bymonth = [int(v) for v in parts.pop("BYMONTH", [])]
    until_values = parts.pop("UNTIL", [])
    count_values = parts.pop("COUNT", [])
    if parts:  # BYSETPOS, BYHOUR, BYYEARDAY, BYWEEKNO, …
        raise unsupported
    if wkst != ["MO"] and freq == "WEEKLY" and interval > 1 and len(byday) > 1:
        raise unsupported  # the weeks would be cut differently
    if bymonth and not (freq == "YEARLY" and bymonth == [start.month]):
        raise unsupported
    out = [f"FREQ={freq}"]
    if interval != 1:
        out.append(f"INTERVAL={interval}")
    if byday:
        if freq == "YEARLY" or freq == "DAILY":
            raise unsupported
        out.append("BYDAY=" + ",".join(byday))
    if bymonthday:
        out.append("BYMONTHDAY=" + ",".join(str(day) for day in bymonthday))
    if until_values:
        until = _in_zone(until_values[0], zone or "UTC")
        out.append(f"UNTIL={until.strftime('%Y%m%d')}")
    if count_values:
        out.append(f"COUNT={int(count_values[0])}")
    return ";".join(out)


def fitted_start(start: date, rrule: str) -> tuple[date, bool]:
    """The start, or the first occurrence after it when the rule does not take the start; raises Skip."""
    try:
        check(start, rrule)
        return start, False
    except UnsupportedRruleError:
        raise Skip("Its repeat rule is not supported") from None
    except StartNotInRuleError:
        pass
    for days in range(1, _MOVE_DAYS):
        candidate = start + timedelta(days=days)
        try:
            check(candidate, rrule)
        except StartNotInRuleError:
            continue
        if "UNTIL=" in rrule and candidate.strftime("%Y%m%d") > rrule.split("UNTIL=")[1][:8]:
            break
        return candidate, True
    raise Skip("Its repeat rule has no dates")


# ---------------------------------------------------------------- reading


def _text(component: icalendar.cal.Component, name: str) -> str:
    value = component.get(name)
    return str(value).strip() if value is not None else ""


def _priority(component: icalendar.cal.Component) -> str:
    try:
        value = int(component.get("PRIORITY", 0))
    except TypeError, ValueError:
        return "medium"
    return "high" if 1 <= value <= 4 else "low" if 6 <= value <= 9 else "medium"


def _times(component: icalendar.cal.Component, profile_zone: str) -> tuple[dict[str, Any], str | None, bool]:
    """The event's time fields, its zone and whether a time had to be converted to the user's zone."""
    start = _moment(component, "DTSTART", profile_zone)
    if start is None:
        raise Skip("It has no start")
    end = _moment(component, "DTEND", profile_zone)
    duration = component.decoded("DURATION") if "DURATION" in component else None
    if not isinstance(start.value, datetime):
        first = start.value
        if end is not None and not isinstance(end.value, datetime) and end.value > first:
            last = end.value - timedelta(days=1)
        elif isinstance(duration, timedelta) and duration.days > 0:
            last = first + timedelta(days=duration.days - 1)
        else:
            last = first
        return {"all_day": True, "start_date": first.isoformat(), "end_date": last.isoformat()}, None, False
    zone = start.zone or profile_zone
    begin = start.value
    if end is not None and isinstance(end.value, datetime):
        if end.zone == zone or end.zone is None:
            finish = end.value
        else:  # another zone: the same instant on the start's clock
            aware = end.value.replace(tzinfo=ZoneInfo(end.zone))
            finish = aware.astimezone(ZoneInfo(zone)).replace(tzinfo=None)
    elif isinstance(duration, timedelta):
        finish = begin + duration
    else:
        finish = begin
    finish = max(finish, begin)
    return (
        {
            "all_day": False,
            "start_date": begin.date().isoformat(),
            "start_time": begin.strftime("%H:%M"),
            "end_date": finish.date().isoformat(),
            "end_time": finish.strftime("%H:%M"),
            "tzid": zone,
        },
        zone,
        start.converted,
    )


def _draft(component: icalendar.cal.Component, profile_zone: str, color: str) -> tuple[Draft, list[str]]:
    notes: list[str] = []
    title = _text(component, "SUMMARY") or NO_TITLE
    shown = title[:60]
    if len(title) > TITLE_MAX:
        notes.append(f"“{shown}…”: the title was shortened to {TITLE_MAX} characters")
        title = title[:TITLE_MAX].rstrip()
    location = _text(component, "LOCATION")
    if len(location) > LOCATION_MAX:
        notes.append(f"“{shown}”: the place was shortened to {LOCATION_MAX} characters")
        location = location[:LOCATION_MAX].rstrip()
    times, _zone, converted = _times(component, profile_zone)
    if converted:
        notes.append(f"“{shown}”: its time zone is unknown here, so its time is shown in yours")
    data: dict[str, Any] = {
        "title": title,
        "body": _text(component, "DESCRIPTION") or None,
        "location": location or None,
        "priority": _priority(component),
        "color": color,
        **times,
    }
    uid = _text(component, "UID")[:255] or None
    return Draft(uid=uid, title=title, data=data), notes


def _dates(component: icalendar.cal.Component, name: str) -> list[date | datetime]:
    found = component.get(name)
    if found is None:
        return []
    lists = found if isinstance(found, list) else [found]
    out: list[date | datetime] = []
    for item in lists:
        for value in getattr(item, "dts", []):
            if isinstance(value.dt, date):  # PERIOD values are tuples: left out
                out.append(value.dt)
    return out


def parse(raw: bytes, profile_zone: str, color: str) -> Parsed:
    """The events of an .ics file; raises NotCalendarError when it is none."""
    try:
        calendars = icalendar.Calendar.from_ical(raw, multiple=True)
    except ValueError as error:
        raise NotCalendarError(str(error)) from None
    if not calendars:
        raise NotCalendarError("no VCALENDAR")
    parsed = Parsed()
    alarms = attachments = others = 0
    count = 0
    for calendar in calendars:
        others += len(calendar.walk("VTODO")) + len(calendar.walk("VJOURNAL"))
        for component in calendar.walk("VEVENT"):
            count += 1
            if count > MAX_EVENTS:
                raise NotCalendarError(f"more than {MAX_EVENTS} events")
            title = _text(component, "SUMMARY") or NO_TITLE
            cancelled = _text(component, "STATUS").upper() == "CANCELLED"
            try:
                draft, notes = _draft(component, profile_zone, color)
            except Skip as reason:
                parsed.skipped.append((title, str(reason)))
                continue
            alarms += 1 if component.walk("VALARM") else 0
            attachments += 1 if "ATTACH" in component else 0
            zone = str(draft.data.get("tzid") or profile_zone)
            if "RECURRENCE-ID" in component and draft.uid:
                draft.recurrence_of = _in_zone(component.decoded("RECURRENCE-ID"), zone)
                draft.cancelled = cancelled
                parsed.overrides.setdefault(draft.uid, []).append(draft)
                parsed.warnings += notes
                continue
            if cancelled:
                parsed.skipped.append((draft.title, "It is cancelled"))
                continue
            try:
                if "RRULE" in component:
                    rrule = map_rule(
                        component.get("RRULE"), date.fromisoformat(draft.data["start_date"]), zone
                    )
                    if draft.data["end_date"] != draft.data["start_date"]:
                        raise Skip("A repeating event lasts one day here")
                    start = date.fromisoformat(draft.data["start_date"])
                    moved, did_move = fitted_start(start, rrule)
                    if did_move:
                        notes.append(
                            f"“{draft.title[:60]}”: it starts on its first repeat date, {moved.isoformat()}"
                        )
                        draft.data["start_date"] = draft.data["end_date"] = moved.isoformat()
                    draft.data["rrule"] = rrule
                    draft.exdates = sorted({_in_zone(value, zone) for value in _dates(component, "EXDATE")})
            except Skip as reason:
                parsed.skipped.append((draft.title, str(reason)))
                continue
            parsed.events.append(draft)
            parsed.warnings += notes
            for extra in _dates(component, "RDATE"):  # each extra date: a one-off event of its own
                day = _in_zone(extra, zone)
                copy = dict(draft.data, rrule=None)
                span = date.fromisoformat(draft.data["end_date"]) - date.fromisoformat(
                    draft.data["start_date"]
                )
                copy["start_date"], copy["end_date"] = day.isoformat(), (day + span).isoformat()
                parsed.events.append(Draft(uid=None, title=draft.title, data=copy))
    if others:
        parsed.warnings.append(f"{others} tasks or journal entries were left out: only events are imported")
    if alarms:
        parsed.warnings.append(f"Reminders of {alarms} events were not imported: set them in Haalendar")
    if attachments:
        parsed.warnings.append(f"Attachments of {attachments} events were not imported")
    return parsed


# ---------------------------------------------------------------- writing


@dataclass(frozen=True, slots=True)
class IcsEvent:
    uid: str
    summary: str
    start: date | datetime
    end: date | datetime
    all_day: bool
    tzid: str | None = None
    description: str | None = None
    location: str | None = None
    rrule: str | None = None
    exdates: tuple[date, ...] = ()
    created: datetime | None = None
    last_modified: datetime | None = None


def _rule_for_export(rrule: str, event: IcsEvent) -> icalendar.vRecur:
    recur: icalendar.vRecur = icalendar.vRecur.from_ical(rrule)
    if not event.all_day and "UNTIL" in recur and event.tzid:
        # RFC 5545: with a zoned DTSTART, UNTIL is in UTC — the last moment of that day in the event's zone.
        day = recur["UNTIL"][0]
        day = day.date() if isinstance(day, datetime) else day
        last = datetime.combine(day, time(23, 59, 59), ZoneInfo(event.tzid)).astimezone(UTC)
        recur["UNTIL"] = [last]
    return recur


def calendar_ics(name: str, events: Iterable[IcsEvent], stamp: datetime) -> str:
    """The calendar as iCalendar text (CRLF lines, folded at 75 octets), with VTIMEZONE for each zone used."""
    calendar = icalendar.Calendar()
    calendar.add("VERSION", "2.0")
    calendar.add("PRODID", "-//Haalendar//Export 1.0//EN")
    calendar.add("CALSCALE", "GREGORIAN")
    calendar.add("X-WR-CALNAME", icalendar.vText(name))  # an X- property: TEXT escaping explicitly
    for event in events:
        component = icalendar.Event()
        component.add("UID", event.uid)
        component.add("DTSTAMP", stamp)
        zone = ZoneInfo(event.tzid) if event.tzid and not event.all_day else None
        start, end = event.start, event.end
        if zone is not None and isinstance(start, datetime) and isinstance(end, datetime):
            start, end = start.replace(tzinfo=zone), end.replace(tzinfo=zone)
        component.add("DTSTART", start)
        component.add("DTEND", end)
        component.add("SUMMARY", event.summary)
        if event.description:
            component.add("DESCRIPTION", event.description)
        if event.location:
            component.add("LOCATION", event.location)
        if event.rrule:
            component.add("RRULE", _rule_for_export(event.rrule, event))
            for day in event.exdates:
                value: date | datetime = day
                if zone is not None and isinstance(event.start, datetime):
                    value = datetime.combine(day, event.start.time(), zone)
                component.add("EXDATE", value)
        if event.created:
            component.add("CREATED", event.created.astimezone(UTC))
        if event.last_modified:
            component.add("LAST-MODIFIED", event.last_modified.astimezone(UTC))
        calendar.add_component(component)
    calendar.add_missing_timezones()
    text: str = calendar.to_ical().decode("utf-8")
    return text


def ics_event(
    item_id: uuid.UUID,
    title: str,
    body: str | None,
    event: Any,
    exdates: Iterable[date],
    created: datetime | None,
    updated: datetime | None,
) -> IcsEvent:
    """An event row of the database as written to the file (all-day: DTEND is the day after the last one)."""
    uid = event.ics_uid or f"{item_id}@haalendar"
    if event.all_day:
        return IcsEvent(
            uid=uid,
            summary=title,
            start=event.start_date,
            end=event.end_date + timedelta(days=1),
            all_day=True,
            description=body,
            location=event.location,
            rrule=event.rrule,
            exdates=tuple(sorted(exdates)),
            created=created,
            last_modified=updated,
        )
    return IcsEvent(
        uid=uid,
        summary=title,
        start=datetime.combine(event.start_date, event.start_time or time.min),
        end=datetime.combine(event.end_date, event.end_time or time.min),
        all_day=False,
        tzid=event.tzid,
        description=body,
        location=event.location,
        rrule=event.rrule,
        exdates=tuple(sorted(exdates)),
        created=created,
        last_modified=updated,
    )
