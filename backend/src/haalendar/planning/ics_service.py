"""Importing an .ics file into a calendar and exporting a calendar as .ics (FR-CAL-33, C-09, D-83).

+++===+++ 2026-10-29 — Hasan Alizada — HAAL-095.
- Import needs write access to the calendar (own or shared with "edit", not archived). Every event is created like an
  event from sync (the same checks, audit, versions), each in a savepoint: an event the checks refuse is skipped with
  their reason and the others are kept. An event whose UID is already in this calendar is skipped ("already
  imported"), so the same file can be imported again; its replaced occurrences go with it. Excluded dates that are no
  occurrence of the imported rule are left out. A replaced occurrence becomes a one-off event that replaces that date
  of its series; without its series in the file (or when the series was skipped for another reason) it is an ordinary
  one-off event. The report names what was imported (ids, for undo) and what was skipped and why.
- Export needs read access (also a calendar shared for viewing, hidden or archived): every live event of the calendar.
"""

from __future__ import annotations

import uuid
from dataclasses import dataclass, field
from datetime import UTC, date, datetime
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from haalendar.accounts.models import UserAccount
from haalendar.authz import require
from haalendar.errors import ProblemCode, ProblemError
from haalendar.logging import get_logger
from haalendar.planning import ics
from haalendar.planning.models import Calendar, Event, Item, RecurrenceException
from haalendar.planning.occurrences import exclude, is_occurrence
from haalendar.planning.service import create_item
from haalendar.preferences.service import get_settings

log = get_logger(__name__)

ALREADY = "It was imported before"


@dataclass
class ImportReport:
    imported: list[uuid.UUID] = field(default_factory=list)
    skipped: list[tuple[str, str]] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)


def _reason(error: ProblemError) -> str:
    details = [str(e.get("detail")) for e in (error.errors or []) if e.get("detail")]
    return "; ".join(details) if details else (error.detail or error.code.value)


async def _existing_uids(db: AsyncSession, calendar_id: uuid.UUID, uids: set[str]) -> set[str]:
    if not uids:
        return set()
    rows = await db.scalars(
        select(Event.ics_uid)
        .join(Item, Item.id == Event.id)
        .where(Event.container_id == calendar_id, Event.ics_uid.in_(uids), Item.deleted_at.is_(None))
    )
    return {uid for uid in rows if uid}


async def _create(
    db: AsyncSession, user_id: uuid.UUID, calendar_id: uuid.UUID, draft: ics.Draft, uid: str | None
) -> uuid.UUID:
    item_id = uuid.uuid7()
    data = {"kind": "event", "container_kind": "calendar", "container_id": str(calendar_id), **draft.data}
    await create_item(db, user_id, item_id, data)
    if uid is not None:
        event = await db.get(Event, item_id)
        if event is not None:
            event.ics_uid = uid
            await db.flush()
    return item_id


async def import_ics(
    db: AsyncSession, user_id: uuid.UUID, calendar_id: uuid.UUID, raw: bytes
) -> ImportReport:
    await require(db, user_id, "write_items", "calendar", calendar_id)
    if len(raw) > ics.MAX_BYTES:
        raise ProblemError(413, ProblemCode.PAYLOAD_TOO_LARGE, "The file is larger than 5 MB")
    owner = await db.get(UserAccount, user_id)
    settings = await get_settings(db, user_id)
    try:
        parsed = ics.parse(raw, owner.time_zone if owner else "UTC", settings.default_color)
    except ics.NotCalendarError:
        raise ProblemError(
            422,
            ProblemCode.VALIDATION_FAILED,
            "This is not an iCalendar file it can read",
            errors=[{"pointer": "/file", "detail": "Choose an .ics file with at most 5000 events"}],
        ) from None
    report = ImportReport(skipped=list(parsed.skipped), warnings=list(parsed.warnings))
    existing = await _existing_uids(db, calendar_id, {d.uid for d in parsed.events if d.uid})
    series: dict[str, uuid.UUID] = {}  # UID → the series created from it
    left_out: set[str] = set()  # UIDs already imported: their replaced occurrences stay out too
    for draft in parsed.events:
        if draft.uid is not None and (draft.uid in existing or draft.uid in series):
            report.skipped.append((draft.title, ALREADY))
            left_out.add(draft.uid)
            continue
        try:
            async with db.begin_nested():
                item_id = await _create(db, user_id, calendar_id, draft, draft.uid)
                event = await db.get(Event, item_id)
                for day in draft.exdates:
                    if event is not None and is_occurrence(event, day):
                        await exclude(db, user_id, item_id, day, None, {})
        except ProblemError as error:
            report.skipped.append((draft.title, _reason(error)))
            continue
        report.imported.append(item_id)
        if draft.uid is not None and draft.data.get("rrule"):
            series[draft.uid] = item_id
    for uid, overrides in parsed.overrides.items():
        if uid in left_out:
            report.skipped += [(o.title, ALREADY) for o in overrides]
            continue
        for override in overrides:
            master = series.get(uid)
            when = override.recurrence_of
            try:
                async with db.begin_nested():
                    master_event = await db.get(Event, master) if master else None
                    fits = master_event is not None and when is not None and is_occurrence(master_event, when)
                    if override.cancelled:
                        if master is not None and when is not None and fits:
                            await exclude(db, user_id, master, when, None, {})
                        continue
                    item_id = await _create(db, user_id, calendar_id, override, None)
                    if master is not None and when is not None and fits:
                        await exclude(db, user_id, master, when, item_id, {})
            except ProblemError as error:
                report.skipped.append((override.title, _reason(error)))
                continue
            if not override.cancelled:
                report.imported.append(item_id)
    log.info(
        "ics_imported",
        calendar_id=str(calendar_id),
        user_id=str(user_id),
        imported=len(report.imported),
        skipped=len(report.skipped),
    )
    return report


async def calendar_events(db: AsyncSession, calendar_id: uuid.UUID) -> list[ics.IcsEvent]:
    """Every live event of the calendar as written to an .ics file (read under the caller's row-level security)."""
    rows = (
        await db.execute(
            select(Item, Event)
            .join(Event, Event.id == Item.id)
            .where(Item.container_id == calendar_id, Item.kind == "event", Item.deleted_at.is_(None))
            .order_by(Event.start_date, Item.created_at, Item.id)
        )
    ).all()
    series = [event.id for _, event in rows if event.rrule]
    excluded: dict[uuid.UUID, list[date]] = {}
    if series:
        for event_id, day in (
            await db.execute(
                select(RecurrenceException.event_id, RecurrenceException.occurrence_date).where(
                    RecurrenceException.event_id.in_(series), RecurrenceException.deleted_at.is_(None)
                )
            )
        ).all():
            excluded.setdefault(event_id, []).append(day)
    return [
        ics.ics_event(
            item.id,
            item.title,
            item.body,
            event,
            excluded.get(event.id, []),
            item.created_at,
            item.updated_at,
        )
        for item, event in rows
    ]


async def export_ics(db: AsyncSession, user_id: uuid.UUID, calendar_id: uuid.UUID) -> tuple[str, str]:
    """The calendar's name and its .ics text."""
    await require(db, user_id, "read", "calendar", calendar_id)
    calendar = await db.get(Calendar, calendar_id)
    if calendar is None:
        raise ProblemError(404, ProblemCode.NOT_FOUND, "Not found")
    text = ics.calendar_ics(calendar.name, await calendar_events(db, calendar_id), datetime.now(UTC))
    log.info("ics_exported", calendar_id=str(calendar_id), user_id=str(user_id))
    return calendar.name, text


def report_out(report: ImportReport) -> dict[str, Any]:
    return {
        "imported": len(report.imported),
        "skipped": len(report.skipped),
        "warnings": report.warnings,
        "item_ids": [str(i) for i in report.imported],
        "skipped_events": [{"title": title, "reason": reason} for title, reason in report.skipped],
    }
