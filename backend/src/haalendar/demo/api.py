"""`GET /demo/status`: is this a demo, when is the next reset, how to sign in (FR-OPS-03).

+++===+++ 2026-11-09 — Hasan Alizada — HAAL-154. Public: the sign-in page needs it. Outside demo mode only `false`.
"""

from __future__ import annotations

from datetime import UTC, datetime

from fastapi import APIRouter
from pydantic import Field

from haalendar.demo import ACCOUNTS, PASSWORD, next_reset_at
from haalendar.deps import AppSettings
from haalendar.security.schemas import ApiModel

router = APIRouter(prefix="/demo", tags=["system"])


class DemoAccountOut(ApiModel):
    email: str
    display_name: str
    password: str


class DemoStatusOut(ApiModel):
    demo_mode: bool
    next_reset_at: datetime | None = None
    accounts: list[DemoAccountOut] = Field(default_factory=list)


@router.get("/status", operation_id="getDemoStatus")
async def demo_status(settings: AppSettings) -> DemoStatusOut:
    if not settings.demo_mode:
        return DemoStatusOut(demo_mode=False)
    return DemoStatusOut(
        demo_mode=True,
        next_reset_at=next_reset_at(datetime.now(UTC)),
        accounts=[
            DemoAccountOut(email=account.email, display_name=account.display_name, password=PASSWORD)
            for account in ACCOUNTS
        ],
    )
