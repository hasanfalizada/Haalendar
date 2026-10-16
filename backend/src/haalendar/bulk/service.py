"""Bulk operations (FR-X-07, owner decision D-41): one action on up to 500 selected rows, all-or-nothing.

+++===+++ 2026-10-16 — Hasan Alizada — HAAL-036.
- Sources: every kind that can be selected registers a BulkSource (model, supported actions, who may change a row,
  refusals such as "the default calendar cannot be deleted", children restored with a delete batch). Today:
  calendars (delete, restore, color; owner only). Events, notes and cards register with their modules, including
  priority and "move to next day".
- All-or-nothing: every target is checked first (exists and is visible under row-level security, may be changed,
  version as the client saw it, action supported); one refusal refuses the whole request and names the offending
  targets (/targets/{index}). Only version conflicts → 412, otherwise 422. Rows are locked while checked.
- delete puts all targets into one delete batch (one undo step: restoring the batch); restore brings back the batch
  of each target. Changes are audited by the database triggers. The answer lists the new versions.
"""

from __future__ import annotations

import uuid
from collections.abc import Callable
from dataclasses import dataclass, field
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from haalendar.bulk.schemas import (
    BulkAction,
    BulkIn,
    BulkItemOut,
    BulkOut,
    BulkTargetIn,
    BulkType,
    TargetFailure,
)
from haalendar.errors import ProblemCode, ProblemError
from haalendar.logging import get_logger
from haalendar.planning.models import Calendar
from haalendar.softdelete import new_batch, restore_batch, soft_delete

log = get_logger(__name__)


@dataclass(frozen=True, slots=True)
class BulkSource:
    kind: BulkType
    model: type[Any]
    actions: frozenset[BulkAction]
    # A visible row the user may change (row-level security already hides the rest).
    may_change: Callable[[Any, uuid.UUID], bool]
    # Reason a permitted change is still refused for this row and action, or None.
    refuse: Callable[[Any, BulkAction], TargetFailure | None] = field(default=lambda row, action: None)
    # Models restored together with a delete batch of this kind.
    children: tuple[type[Any], ...] = ()


SOURCES: dict[str, BulkSource] = {
    "calendar": BulkSource(
        kind="calendar",
        model=Calendar,
        actions=frozenset({"delete", "restore", "set_color"}),
        # Container settings belong to the owner; an edit share grants the contents only.
        may_change=lambda row, user_id: row.owner_id == user_id,
        # Exactly one active default calendar per user (FR-CAL-32).
        refuse=lambda row, action: "invalid_state" if action == "delete" and row.is_default else None,
    ),
}

_DETAIL: dict[TargetFailure, str] = {
    "not_found": "Not found or not available to you",
    "forbidden": "You may not change this",
    "version_conflict": "Changed elsewhere in the meantime",
    "unsupported": "This action is not available for this kind",
    "invalid_state": "Not possible in the current state",
}


def _value(body: BulkIn, target: BulkTargetIn) -> str | None:
    if body.action == "set_color":
        return target.color or body.color
    if body.action == "set_priority":
        return target.priority or body.priority
    return None


async def _load(
    db: AsyncSession, source: BulkSource, target: BulkTargetIn, action: BulkAction, *, lock: bool
) -> Any:
    model = source.model
    deleted = model.deleted_at.is_not(None) if action == "restore" else model.deleted_at.is_(None)
    query = select(model).where(model.id == target.id, deleted).execution_options(populate_existing=True)
    # FOR UPDATE is subject to the UPDATE policy of row-level security, which would hide a row the user may read but
    # not change; so the row is read first and locked only once the user may change it.
    return await db.scalar(query.with_for_update() if lock else query)


async def apply(db: AsyncSession, user_id: uuid.UUID, body: BulkIn) -> BulkOut:
    # Selecting a row twice changes it once.
    targets: list[tuple[int, BulkTargetIn]] = []
    seen: set[tuple[str, uuid.UUID]] = set()
    for index, target in enumerate(body.targets):
        if (target.type, target.id) not in seen:
            seen.add((target.type, target.id))
            targets.append((index, target))

    errors: list[dict[str, str]] = []
    rows: list[tuple[BulkSource, BulkTargetIn, Any]] = []

    def refuse(index: int, code: TargetFailure) -> None:
        errors.append({"pointer": f"/targets/{index}", "code": code, "detail": _DETAIL[code]})

    for index, target in targets:
        if body.action in ("set_color", "set_priority") and _value(body, target) is None:
            field_name = "color" if body.action == "set_color" else "priority"
            errors.append(
                {"pointer": f"/targets/{index}/{field_name}", "code": "required", "detail": "Required"}
            )
            continue
        source = SOURCES.get(target.type)
        if source is None or body.action not in source.actions:
            refuse(index, "unsupported")
            continue
        row = await _load(db, source, target, body.action, lock=False)
        if row is not None and source.may_change(row, user_id):
            row = await _load(db, source, target, body.action, lock=True)
        if row is None:
            refuse(index, "not_found")
        elif not source.may_change(row, user_id):
            refuse(index, "forbidden")
        elif row.version != target.version:
            refuse(index, "version_conflict")
        elif (reason := source.refuse(row, body.action)) is not None:
            refuse(index, reason)
        else:
            rows.append((source, target, row))

    if errors:
        only_conflicts = all(e["code"] == "version_conflict" for e in errors)
        log.info(
            "bulk_refused",
            user_id=str(user_id),
            action=body.action,
            targets=len(targets),
            refused=len(errors),
            codes=sorted({e["code"] for e in errors}),
        )
        raise ProblemError(
            412 if only_conflicts else 422,
            ProblemCode.VERSION_CONFLICT if only_conflicts else ProblemCode.VALIDATION_FAILED,
            f"{len(errors)} of {len(targets)} selected could not be changed; nothing was changed",
            errors=errors,
        )

    batch: uuid.UUID | None = None
    if body.action == "delete":
        batch = new_batch()
        for _, _, row in rows:
            soft_delete(row, user_id, batch)
    elif body.action == "restore":
        batches: dict[uuid.UUID, BulkSource] = {row.delete_batch_id: source for source, _, row in rows}
        for batch_id, source in batches.items():
            await restore_batch(db, [source.model, *source.children], batch_id, user_id)
    elif body.action in ("set_color", "set_priority"):
        attribute = "color" if body.action == "set_color" else "priority"
        for _, target, row in rows:
            setattr(row, attribute, _value(body, target))
            row.version += 1
            row.updated_by = user_id
    else:  # move_next_day: registered by the events module (HAAL-08x); no source supports it yet
        raise ProblemError(422, ProblemCode.VALIDATION_FAILED, "Action not available")

    await db.flush()
    items: list[BulkItemOut] = []
    for source, target, row in rows:
        await db.refresh(row, ["version"])
        items.append(BulkItemOut(type=source.kind, id=target.id, version=row.version))
    log.info(
        "bulk_applied",
        user_id=str(user_id),
        action=body.action,
        applied=len(rows),
        delete_batch_id=str(batch) if batch else None,
    )
    return BulkOut(applied=len(rows), delete_batch_id=batch, items=items)
