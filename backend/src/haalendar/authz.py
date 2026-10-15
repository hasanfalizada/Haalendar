"""Authorization for planning data: loads the access facts of a container and applies the authz.check.v1 atom.

+++===+++ 2026-10-15 — Hasan Alizada — HAAL-165. Every content endpoint calls `require(...)` before acting (FR-ACC-07,
ADR-0005 section 7). Facts are read inside the request transaction, i.e. already under row-level security: a container
the user may not read is simply not found, which matches the atom's 404. Refusals are logged with ids only.
"""

from __future__ import annotations

import uuid
from dataclasses import dataclass

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from haalendar.atoms.authz.check import Action, Decision, SharePermission, check
from haalendar.errors import ProblemCode, ProblemError
from haalendar.logging import get_logger
from haalendar.planning.models import Calendar
from haalendar.security.rls import ContainerKind

log = get_logger(__name__)

# Container kind → model; board and note join when their tables exist.
CONTAINERS: dict[ContainerKind, type[Calendar]] = {"calendar": Calendar}


@dataclass(frozen=True, slots=True)
class ContainerAccess:
    owner_id: uuid.UUID
    share_permission: SharePermission | None


async def container_access(
    db: AsyncSession, kind: ContainerKind, container_id: uuid.UUID
) -> ContainerAccess | None:
    """Owner and the current user's active share of a live container, or None when it is not visible."""
    model = CONTAINERS.get(kind)
    if model is None:
        return None
    owner_id = await db.scalar(
        select(model.owner_id).where(model.id == container_id, model.deleted_at.is_(None))
    )
    if owner_id is None:
        return None
    permission = await db.scalar(select(func.haalendar_share_permission(kind, container_id)))
    return ContainerAccess(
        owner_id=owner_id, share_permission=permission if permission in ("view", "edit") else None
    )


async def require(
    db: AsyncSession, user_id: uuid.UUID, action: Action, kind: ContainerKind, container_id: uuid.UUID
) -> Decision:
    """Allow or raise 404 (not readable: no existence leak) / 403 (readable, action not permitted)."""
    access = await container_access(db, kind, container_id)
    decision = (
        check(user_id, action, access.owner_id, access.share_permission)
        if access is not None
        else Decision(False, 404, "not_shared")
    )
    if decision.allowed:
        return decision
    log.info(
        "authz_denied",
        user_id=str(user_id),
        action=action,
        container_kind=kind,
        container_id=str(container_id),
        reason=decision.reason,
    )
    if decision.deny_status == 404:
        raise ProblemError(404, ProblemCode.NOT_FOUND, "Not found")
    raise ProblemError(403, ProblemCode.FORBIDDEN, "You do not have permission for this action")
