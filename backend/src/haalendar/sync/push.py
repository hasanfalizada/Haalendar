"""Push: apply queued offline mutations exactly once (ADR-0009, D-56).

+++===+++ 2026-10-21 — Hasan Alizada — HAAL-053.
- Mutations are applied in the order sent, each in its own savepoint through the planning services (rights,
  validation, audit, soft delete); one failing mutation does not stop the others.
- Exactly once: a mutation id seen before answers `duplicate` with the stored result and changes nothing.
- Results: `applied` (new version), `conflict` (fields kept at the server value; `current` is the server state),
  `rejected` (validation, permission, not found, deleted elsewhere — with an RFC 9457 problem; never retried).
- +++===+++ 2026-10-22 — Hasan Alizada — HAAL-054. A delete that applied although the record changed after
  `base_version` says `edited_elsewhere` (ADR-0009 rule 4: the user is told; the record is in the trash).
- Supported now: calendars (create, update, delete, restore) and the shared item fields (update, move, delete,
  restore). Creating items arrives with their modules.
- +++===+++ 2026-10-22 — Hasan Alizada — HAAL-066. Items of kind `event` can be created, and their event fields
  changed (planning.events checks the whole event; time fields conflict as a group).
- +++===+++ 2026-10-28 — Hasan Alizada — HAAL-091. Reminders: create, update, delete, restore (planning.reminders).
"""

from __future__ import annotations

import uuid
from http import HTTPStatus
from typing import Any

from pydantic import ValidationError
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from haalendar.errors import ProblemCode, ProblemError
from haalendar.logging import get_logger
from haalendar.planning import occurrences, reminders
from haalendar.planning import service as planning
from haalendar.planning.service import Outcome
from haalendar.sync.models import SyncMutation
from haalendar.sync.pull import current_state
from haalendar.sync.schemas import (
    CalendarData,
    ItemCreateData,
    ItemData,
    MoveData,
    MutationIn,
    OccurrenceData,
    ReminderCreateData,
    ReminderData,
)

log = get_logger(__name__)


def _invalid(error: ValidationError) -> ProblemError:
    return ProblemError(
        422,
        ProblemCode.VALIDATION_FAILED,
        "Invalid change",
        errors=[
            {"pointer": "/data/" + "/".join(str(p) for p in item["loc"]), "detail": item["msg"]}
            for item in error.errors()
        ],
    )


def _unsupported(mutation: MutationIn) -> ProblemError:
    return ProblemError(
        409, ProblemCode.INVALID_STATE, f"{mutation.op} of {mutation.entity_type} cannot be synced yet"
    )


def _fields(
    model: type[CalendarData]
    | type[ItemData]
    | type[ItemCreateData]
    | type[ReminderData]
    | type[ReminderCreateData],
    raw: dict[str, Any] | None,
) -> dict[str, Any]:
    try:
        return model.model_validate(raw or {}).model_dump(exclude_unset=True)
    except ValidationError as error:
        raise _invalid(error) from None


async def _apply(db: AsyncSession, user_id: uuid.UUID, m: MutationIn) -> Outcome:
    current = await current_state(db, m.entity_type, m.entity_id) or {}
    if m.entity_type == "calendar":
        if m.op == "create":
            data = _fields(CalendarData, m.data)
            if not data.get("name"):
                raise ProblemError(422, ProblemCode.VALIDATION_FAILED, "Enter a name")
            calendar = await planning.create_calendar(
                db, user_id, m.entity_id, data["name"], data.get("color") or "blue"
            )
            return Outcome(version=calendar.version)
        if m.op == "update":
            return await planning.update_calendar(
                db, user_id, m.entity_id, m.base or {}, _fields(CalendarData, m.data), current
            )
        if m.op == "delete":
            return await planning.delete_calendar(db, user_id, m.entity_id, m.base_version)
        if m.op == "restore":
            return await planning.restore_calendar(db, user_id, m.entity_id)
        raise _unsupported(m)
    if m.entity_type == "reminder":
        if m.op == "create":
            return await reminders.create_reminder(
                db, user_id, m.entity_id, _fields(ReminderCreateData, m.data)
            )
        if m.op == "update":
            return await reminders.update_reminder(
                db, user_id, m.entity_id, m.base or {}, _fields(ReminderData, m.data), current
            )
        if m.op == "delete":
            return await reminders.delete_reminder(db, user_id, m.entity_id)
        if m.op == "restore":
            return await reminders.restore_reminder(db, user_id, m.entity_id)
        raise _unsupported(m)
    if m.op == "create":
        return await planning.create_item(db, user_id, m.entity_id, _fields(ItemCreateData, m.data))
    if m.op == "update":
        return await planning.update_item(
            db, user_id, m.entity_id, m.base or {}, _fields(ItemData, m.data), current
        )
    if m.op == "move":
        try:
            target = MoveData.model_validate(m.data or {})
        except ValidationError as error:
            raise _invalid(error) from None
        return await planning.move_item(
            db, user_id, m.entity_id, m.base or {}, target.container_kind, target.container_id, current
        )
    if m.op == "delete":
        return await planning.delete_item(db, user_id, m.entity_id, m.base_version)
    if m.op == "restore":
        return await planning.restore_item(db, user_id, m.entity_id)
    # +++===+++ 2026-10-23 — Hasan Alizada — HAAL-067. One occurrence of a series leaves it or comes back.
    if m.op in ("exclude", "include"):
        try:
            occurrence = OccurrenceData.model_validate(m.data or {})
        except ValidationError as error:
            raise _invalid(error) from None
        if m.op == "exclude":
            version = await occurrences.exclude(
                db, user_id, m.entity_id, occurrence.occurrence_date, occurrence.override_event_id, current
            )
        else:
            version = await occurrences.include(db, user_id, m.entity_id, occurrence.occurrence_date, current)
        return Outcome(version=version)
    raise _unsupported(m)


def _problem(error: ProblemError) -> dict[str, Any]:
    problem: dict[str, Any] = {
        "status": error.status,
        "code": error.code.value,
        "title": HTTPStatus(error.status).phrase,
    }
    if error.detail:
        problem["detail"] = error.detail
    if error.errors:
        problem["errors"] = error.errors
    return problem


async def _record(
    db: AsyncSession, user_id: uuid.UUID, mutation_id: uuid.UUID, result: dict[str, Any]
) -> None:
    db.add(SyncMutation(mutation_id=mutation_id, owner_id=user_id, status=result["status"], result=result))
    await db.flush()


def _id_taken(m: MutationIn) -> dict[str, Any]:
    """A mutation id already used by another user (invisible here): the change is rolled back and refused."""
    problem = ProblemError(409, ProblemCode.DUPLICATE, "This mutation id is already used")
    return {"mutation_id": str(m.mutation_id), "status": "rejected", "problem": _problem(problem)}


async def push(db: AsyncSession, user_id: uuid.UUID, mutations: list[MutationIn]) -> list[dict[str, Any]]:
    results: list[dict[str, Any]] = []
    counts: dict[str, int] = {}
    for m in mutations:
        stored = await db.get(SyncMutation, m.mutation_id)
        if stored is not None:
            result = {**stored.result, "mutation_id": str(m.mutation_id), "status": "duplicate"}
        else:
            try:
                async with db.begin_nested():
                    outcome = await _apply(db, user_id, m)
                    result = {
                        "mutation_id": str(m.mutation_id),
                        "status": "applied",
                        "version": outcome.version,
                    }
                    if outcome.edited_elsewhere:
                        result["edited_elsewhere"] = True
                    if outcome.conflicts:
                        result.update(
                            status="conflict",
                            fields=outcome.conflicts,
                            current=await current_state(db, m.entity_type, m.entity_id),
                        )
                    await _record(db, user_id, m.mutation_id, result)
            except IntegrityError:
                result = _id_taken(m)
            except ProblemError as error:
                result = {"mutation_id": str(m.mutation_id), "status": "rejected", "problem": _problem(error)}
                if error.current is not None:
                    result["current"] = error.current
                try:
                    async with db.begin_nested():
                        await _record(db, user_id, m.mutation_id, result)
                except IntegrityError:
                    result = _id_taken(m)
        counts[result["status"]] = counts.get(result["status"], 0) + 1
        results.append(result)
    log.info("sync_push", user_id=str(user_id), mutations=len(mutations), **counts)
    return results
