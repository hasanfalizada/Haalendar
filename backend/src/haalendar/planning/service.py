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
+++===+++ 2026-10-22 — Hasan Alizada — HAAL-054. A delete carrying the version it was made on applies anyway (ADR-0009
rule 4) and says when the record had changed since (`edited_elsewhere`), so the user can be told.
"""

from __future__ import annotations

import uuid
from dataclasses import dataclass, field
from datetime import UTC, datetime
from typing import Any

from sqlalchemy import update
from sqlalchemy.ext.asyncio import AsyncSession

from haalendar.attachments.models import Attachment
from haalendar.authz import require
from haalendar.errors import ProblemCode, ProblemError
from haalendar.logging import get_logger
from haalendar.planning.models import Calendar, Item
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


def _calendar_fields(calendar: Calendar) -> dict[str, Any]:
    return {"name": calendar.name, "color": calendar.color}


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
    apply, conflicts = merge(_calendar_fields(calendar), base, new)
    if apply:
        for name, value in apply.items():
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
    apply, conflicts = merge({name: getattr(item, name) for name in ITEM_FIELDS}, base, new)
    if apply:
        for name, value in apply.items():
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
    await _writable(db, user_id, target_kind, target_id)
    if item.deleted_at is not None:
        raise _deleted(current_state)
    current = {"container_kind": item.container_kind, "container_id": str(item.container_id)}
    new = {"container_kind": target_kind, "container_id": str(target_id)}
    apply, conflicts = merge(current, {k: str(v) for k, v in base.items()}, new)
    if apply and not conflicts:
        item.container_kind, item.container_id = target_kind, target_id
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
        await db.execute(
            update(Attachment)
            .where(Attachment.item_id == item_id, Attachment.deleted_at.is_(None))
            .values(deleted_at=now, delete_batch_id=batch, updated_by=user_id, version=Attachment.version + 1)
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
        await restore_batch(db, [Item, Attachment], item.delete_batch_id, user_id)
        await db.refresh(item)
    return Outcome(version=item.version)
