"""Web Push endpoints (contract: api/modules/accounts.yaml — push_vapid_key, me_push_subscriptions,
me_push_subscription).

+++===+++ 2026-10-28 — Hasan Alizada — HAAL-091 (stage 2). The public VAPID key for subscribing; a browser's
subscription registered (taken over from another user of the same browser) and revoked — by the user or at sign-out.
"""

from __future__ import annotations

import uuid
from typing import Annotated, Literal

from fastapi import APIRouter, Query, Request, status
from pydantic import BaseModel, Field

from haalendar.deps import AppSettings, Auth, DbSession
from haalendar.push import service
from haalendar.security.schemas import ApiModel

router = APIRouter(tags=["account"])


class VapidKeyOut(BaseModel):
    public_key: str


class SubscriptionKeys(ApiModel):
    p256dh: str = Field(max_length=200)
    auth: str = Field(max_length=100)


class SubscriptionIn(ApiModel):
    endpoint: str = Field(max_length=2048)
    keys: SubscriptionKeys
    # The browser also sends expirationTime; it carries nothing we use.
    expirationTime: int | None = None  # the browser's field name


class SubscriptionOut(BaseModel):
    id: uuid.UUID


@router.get("/push/vapid-public-key", operation_id="getVapidPublicKey")
async def vapid_public_key(auth: Auth, db: DbSession, settings: AppSettings) -> VapidKeyOut:
    public, _private = await service.keys(db, settings)
    return VapidKeyOut(public_key=public)


@router.post(
    "/me/push-subscriptions", status_code=status.HTTP_201_CREATED, operation_id="addPushSubscription"
)
async def add_subscription(
    body: SubscriptionIn, request: Request, auth: Auth, db: DbSession, settings: AppSettings
) -> SubscriptionOut:
    row = await service.subscribe(
        db,
        settings,
        auth.user.id,
        body.endpoint,
        body.keys.p256dh,
        body.keys.auth,
        request.headers.get("user-agent"),
    )
    return SubscriptionOut(id=row.id)


@router.delete(
    "/me/push-subscriptions/{subscription_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    operation_id="removePushSubscription",
)
async def remove_subscription(
    subscription_id: uuid.UUID,
    auth: Auth,
    db: DbSession,
    reason: Annotated[Literal["user", "sign_out"], Query()] = "user",
) -> None:
    await service.revoke(db, auth.user.id, subscription_id, reason)
