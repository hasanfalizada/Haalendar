"""Sharing use cases: share, list, change permission, revoke / leave (FR-ACC-10, ADR-0005 section 6).

+++===+++ 2026-10-15 — Hasan Alizada — HAAL-167. Every operation runs in the request transaction under row-level
security and asks the authz.check.v1 atom (authz.require) before acting:
- only the container owner shares, changes the permission and revokes; a grantee may leave (revoke the own share);
- shares go to active, verified users found by e-mail; never to oneself; at most one active share per grantee
  (409 otherwise — change the permission instead);
- revocation is soft (`revoked_at`); sharing again creates a new row;
- events are logged with ids only (no e-mail addresses). Audit records follow with HAAL-032, sync tombstones with
  HAAL-053, in-app notifications with HAAL-048.
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime
from typing import Any

from sqlalchemy import Select, and_, func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import aliased

from haalendar.accounts.models import UserAccount
from haalendar.authz import CONTAINERS, require
from haalendar.errors import ProblemCode, ProblemError
from haalendar.logging import get_logger
from haalendar.planning.models import Share
from haalendar.security.rls import ContainerKind
from haalendar.sharing.schemas import ContainerKindIn, Permission, ShareOut

log = get_logger(__name__)


def _validation(pointer: str, code: str, detail: str) -> ProblemError:
    return ProblemError(
        422,
        ProblemCode.VALIDATION_FAILED,
        detail,
        errors=[{"pointer": pointer, "detail": detail, "code": code}],
    )


def _supported(kind: ContainerKindIn) -> ContainerKind:
    if kind not in CONTAINERS:
        raise _validation("/container_kind", "unsupported", "Sharing is not available for this kind yet")
    return kind


def _views_query(kind: ContainerKind) -> Select[Share, str, uuid.UUID, UserAccount, UserAccount]:
    model = CONTAINERS[kind]
    grantee = aliased(UserAccount)
    owner = aliased(UserAccount)
    return (
        select(Share, model.name, model.owner_id, grantee, owner)
        .join(model, and_(Share.container_kind == kind, model.id == Share.container_id))
        .join(grantee, grantee.id == Share.grantee_id)
        .join(owner, owner.id == model.owner_id)
        .where(Share.revoked_at.is_(None), model.deleted_at.is_(None))
        .order_by(Share.created_at, Share.id)
    )


def _view(row: Any) -> ShareOut:
    share, name, owner_id, grantee, owner = row
    return ShareOut(
        id=share.id,
        container_kind=share.container_kind,
        container_id=share.container_id,
        container_name=name,
        grantee_id=grantee.id,
        grantee_name=grantee.display_name,
        grantee_email=grantee.email,
        owner_id=owner_id,
        owner_name=owner.display_name,
        permission=share.permission,
        granted_by=share.granted_by,
        created_at=share.created_at,
        revoked_at=share.revoked_at,
        version=share.version,
    )


def _kind_of(share: Share) -> ContainerKind:
    if share.container_kind not in CONTAINERS:
        raise ProblemError(404, ProblemCode.NOT_FOUND, "Not found")
    return share.container_kind


async def _load_view(db: AsyncSession, share: Share) -> ShareOut:
    row = (await db.execute(_views_query(_kind_of(share)).where(Share.id == share.id))).one_or_none()
    if row is None:  # e.g. the container was soft-deleted meanwhile
        raise ProblemError(404, ProblemCode.NOT_FOUND, "Not found")
    return _view(row)


async def list_shares(
    db: AsyncSession,
    user_id: uuid.UUID,
    *,
    direction: str,
    container_kind: ContainerKindIn | None,
    container_id: uuid.UUID | None,
) -> list[ShareOut]:
    views: list[ShareOut] = []
    for kind, model in CONTAINERS.items():
        if container_kind is not None and container_kind != kind:
            continue
        query = _views_query(kind)
        query = (
            query.where(model.owner_id == user_id)
            if direction == "granted"
            else query.where(Share.grantee_id == user_id)
        )
        if container_id is not None:
            query = query.where(Share.container_id == container_id)
        views.extend(_view(row) for row in (await db.execute(query)).all())
    return views


async def create_share(
    db: AsyncSession,
    user_id: uuid.UUID,
    *,
    container_kind: ContainerKindIn,
    container_id: uuid.UUID,
    grantee_email: str,
    permission: Permission,
) -> ShareOut:
    kind = _supported(container_kind)
    await require(db, user_id, "share", kind, container_id)
    grantee = await db.scalar(
        select(UserAccount).where(
            func.lower(UserAccount.email) == grantee_email.strip().lower(),
            UserAccount.deactivated_at.is_(None),
            UserAccount.email_verified_at.is_not(None),
        )
    )
    if grantee is None:
        log.info("share_rejected_unknown_user", user_id=str(user_id))
        raise _validation(
            "/grantee_email", "user_not_found", "No user with this e-mail address on this instance"
        )
    if grantee.id == user_id:
        raise _validation("/grantee_email", "self", "You already own this")
    existing = await db.scalar(
        select(Share.id).where(
            Share.container_kind == kind,
            Share.container_id == container_id,
            Share.grantee_id == grantee.id,
            Share.revoked_at.is_(None),
        )
    )
    if existing is not None:
        raise ProblemError(
            409, ProblemCode.DUPLICATE, "This user already has access; change the permission instead"
        )
    share = Share(
        container_kind=kind,
        container_id=container_id,
        grantee_id=grantee.id,
        permission=permission,
        granted_by=user_id,
    )
    db.add(share)
    try:
        await db.flush()
    except IntegrityError:  # concurrent identical share (partial unique index)
        raise ProblemError(409, ProblemCode.DUPLICATE, "This user already has access") from None
    await db.refresh(share)
    log.info(
        "share_created",
        share_id=str(share.id),
        container_kind=kind,
        container_id=str(container_id),
        grantee_id=str(grantee.id),
        permission=permission,
        user_id=str(user_id),
    )
    return await _load_view(db, share)


async def _active_share(db: AsyncSession, share_id: uuid.UUID) -> Share:
    share = await db.scalar(
        select(Share)
        .where(Share.id == share_id, Share.revoked_at.is_(None))
        .execution_options(populate_existing=True)
    )
    if share is None:  # unknown, revoked, or not visible under row-level security
        raise ProblemError(404, ProblemCode.NOT_FOUND, "Not found")
    return share


async def update_share(
    db: AsyncSession,
    user_id: uuid.UUID,
    share_id: uuid.UUID,
    *,
    permission: Permission,
    expected_version: int,
) -> ShareOut:
    share = await _active_share(db, share_id)
    await require(db, user_id, "share", _kind_of(share), share.container_id)
    if share.version != expected_version:
        current = await _load_view(db, share)
        raise ProblemError(
            412,
            ProblemCode.VERSION_CONFLICT,
            "The share was changed meanwhile",
            current=current.model_dump(mode="json"),
        )
    if share.permission != permission:
        previous, share.permission = share.permission, permission
        share.version += 1
        await db.flush()
        await db.refresh(share)
        log.info(
            "share_permission_changed",
            share_id=str(share.id),
            previous=previous,
            permission=permission,
            user_id=str(user_id),
        )
    return await _load_view(db, share)


async def revoke_share(db: AsyncSession, user_id: uuid.UUID, share_id: uuid.UUID) -> None:
    share = await _active_share(db, share_id)
    leaving = share.grantee_id == user_id
    if not leaving:
        await require(db, user_id, "share", _kind_of(share), share.container_id)
    share.revoked_at = datetime.now(UTC)
    share.version += 1
    await db.flush()
    log.info(
        "share_revoked", share_id=str(share.id), by="grantee" if leaving else "owner", user_id=str(user_id)
    )
