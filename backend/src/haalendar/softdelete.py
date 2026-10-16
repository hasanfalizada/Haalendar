"""Soft delete (FR-X-01, CRITICAL): application-level guards and the helpers every module uses.

+++===+++ 2026-10-16 — Hasan Alizada — HAAL-030. Layers, from the code outwards:
1. guards installed for every SQLAlchemy session and engine of the process: an ORM delete (`session.delete`), a
   `delete()` statement or any SQL text that deletes or truncates raises PhysicalDeleteError before it reaches the
   database — a clear error instead of a privilege failure;
2. the application role has no DELETE/TRUNCATE privilege (HAAL-165);
3. triggers forbid DELETE/TRUNCATE on every table for every role (haalendar.security.no_delete).
A source scan in the test suite additionally fails on delete constructs in the code.
Deleting = setting deleted_at plus a delete_batch_id shared by everything removed in one operation, so the trash
(HAAL-033) can restore a container together with the children deleted with it, but not those deleted earlier.
"""

from __future__ import annotations

import re
import uuid
from datetime import UTC, datetime
from typing import Any, Protocol

from sqlalchemy import ColumnElement, event, update
from sqlalchemy.engine import Engine
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import InstrumentedAttribute, ORMExecuteState, Session

from haalendar.logging import get_logger

log = get_logger(__name__)

# SQL that removes rows, matched against the statement text only (parameters are never part of it): DELETE FROM
# anywhere (also inside a CTE) or a statement starting with TRUNCATE. DDL such as "BEFORE TRUNCATE ON" is not matched.
_DELETING_SQL = re.compile(r"\bDELETE\s+FROM\b|^\s*TRUNCATE\b", re.IGNORECASE | re.MULTILINE)


class PhysicalDeleteError(RuntimeError):
    """Raised when code tries to delete rows physically (soft delete only)."""


def _forbid_orm_flush(session: Session, flush_context: Any, instances: Any) -> None:
    if session.deleted:
        names = sorted({type(obj).__name__ for obj in session.deleted})
        log.error("physical_delete_blocked", via="orm_flush", models=names)
        raise PhysicalDeleteError(f"Physical delete of {', '.join(names)} is forbidden; use soft_delete()")


def _forbid_orm_delete_statement(state: ORMExecuteState) -> None:
    if state.is_delete:
        log.error("physical_delete_blocked", via="orm_statement")
        raise PhysicalDeleteError("delete() statements are forbidden; use soft_delete()")


def _forbid_sql(
    conn: Any, cursor: Any, statement: str, parameters: Any, context: Any, executemany: bool
) -> None:
    if _DELETING_SQL.search(statement):
        log.error("physical_delete_blocked", via="sql")
        raise PhysicalDeleteError("SQL that deletes rows is forbidden; use soft_delete()")


_installed = False


def install_guards() -> None:
    """Register the guards once per process (idempotent)."""
    global _installed
    if _installed:
        return
    event.listen(Session, "before_flush", _forbid_orm_flush)
    event.listen(Session, "do_orm_execute", _forbid_orm_delete_statement)
    event.listen(Engine, "before_cursor_execute", _forbid_sql)
    _installed = True
    log.info("soft_delete_guards_installed")


class SoftDeletable(Protocol):
    deleted_at: datetime | None
    delete_batch_id: uuid.UUID | None
    version: int
    updated_by: uuid.UUID | None


def new_batch() -> uuid.UUID:
    return uuid.uuid7()


def soft_delete(obj: SoftDeletable, actor_id: uuid.UUID, batch_id: uuid.UUID | None = None) -> uuid.UUID:
    """Mark one row deleted (idempotent: an already deleted row keeps its original time and batch)."""
    batch = batch_id or new_batch()
    if obj.deleted_at is None:
        obj.deleted_at = datetime.now(UTC)
        obj.delete_batch_id = batch
        obj.version += 1
        obj.updated_by = actor_id
    return obj.delete_batch_id or batch


def live(column: InstrumentedAttribute[datetime | None]) -> ColumnElement[bool]:
    """Filter for rows that are not deleted: `select(Model).where(live(Model.deleted_at))`."""
    return column.is_(None)


async def restore_batch(
    db: AsyncSession, models: list[type[Any]], batch_id: uuid.UUID, actor_id: uuid.UUID
) -> int:
    """Restore every row of the given models deleted in one operation; returns the number of rows restored."""
    restored = 0
    for model in models:
        result = await db.execute(
            update(model)
            .where(model.delete_batch_id == batch_id, model.deleted_at.is_not(None))
            .values(deleted_at=None, delete_batch_id=None, version=model.version + 1, updated_by=actor_id)
        )
        restored += getattr(result, "rowcount", 0) or 0
    log.info("soft_delete_batch_restored", batch_id=str(batch_id), rows=restored, user_id=str(actor_id))
    return restored
