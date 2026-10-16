"""FastAPI dependencies shared by all routers: database session, mailer, authentication, CSRF.

+++===+++ 2026-10-15 — Hasan Alizada — HAAL-160. One transaction per request: committed when the endpoint succeeds,
rolled back on any exception. Authentication reads the __Host- session cookie; unsafe methods on authenticated
endpoints additionally require the per-session X-CSRF-Token (CSRF layer 2, ADR-0005).
"""

from __future__ import annotations

from collections.abc import AsyncIterator
from dataclasses import dataclass
from typing import Annotated

from fastapi import Depends, Request
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from haalendar.accounts import crypto, service
from haalendar.accounts.mailer import Mailer
from haalendar.accounts.models import AuthSession, UserAccount
from haalendar.config import Settings
from haalendar.errors import ProblemCode, ProblemError
from haalendar.security.guards import UNSAFE_METHODS
from haalendar.storage import Storage

SESSION_COOKIE = "__Host-haalendar_session"
CSRF_HEADER = "x-csrf-token"
USER_ID_SETTING = "app.user_id"
REQUEST_ID_SETTING = "app.request_id"


async def get_db(request: Request) -> AsyncIterator[AsyncSession]:
    async with request.app.state.session_factory() as session:
        try:
            # +++===+++ 2026-10-16 — Hasan Alizada — HAAL-032. Audit records written in this transaction carry the
            # request id, so an audit entry can be matched to its log lines (transaction-local).
            request_id = getattr(request.state, "request_id", None)
            if request_id:
                await session.execute(select(func.set_config(REQUEST_ID_SETTING, request_id, True)))
            yield session
            await session.commit()
        except BaseException:
            await session.rollback()
            raise


def get_settings_dep(request: Request) -> Settings:
    settings: Settings = request.app.state.settings
    return settings


def get_mailer(request: Request) -> Mailer:
    mailer: Mailer = request.app.state.mailer
    return mailer


def get_storage(request: Request) -> Storage:
    storage: Storage = request.app.state.storage
    return storage


DbSession = Annotated[AsyncSession, Depends(get_db)]
AppSettings = Annotated[Settings, Depends(get_settings_dep)]
AppMailer = Annotated[Mailer, Depends(get_mailer)]
AppStorage = Annotated[Storage, Depends(get_storage)]


@dataclass(frozen=True, slots=True)
class CurrentAuth:
    session: AuthSession
    user: UserAccount


async def current_auth(request: Request, db: DbSession, settings: AppSettings) -> CurrentAuth:
    token = request.cookies.get(SESSION_COOKIE)
    resolved = await service.resolve_session(db, settings, token) if token else None
    if resolved is None:
        raise ProblemError(401, ProblemCode.SESSION_EXPIRED, "Sign in to continue")
    session, user = resolved
    if request.method in UNSAFE_METHODS:
        provided = request.headers.get(CSRF_HEADER, "")
        if not provided or not crypto.constant_time_equals(provided, session.csrf_secret):
            raise ProblemError(403, ProblemCode.CSRF_FAILED, "Missing or invalid CSRF token")
    # +++===+++ 2026-10-15 — Hasan Alizada — HAAL-161. After an admin reset the one-time password must be replaced
    # before anything else is possible (ASVS 5.0 V6).
    if user.must_change_password and request.url.path not in PASSWORD_CHANGE_ALLOWED_PATHS:
        raise ProblemError(403, ProblemCode.PASSWORD_CHANGE_REQUIRED, "Set a new password to continue")
    # +++===+++ 2026-10-15 — Hasan Alizada — HAAL-165. Row-level security context for the rest of this transaction:
    # policies only show rows of this user (transaction-local, so a pooled connection never keeps it).
    await db.execute(select(func.set_config(USER_ID_SETTING, str(user.id), True)))
    return CurrentAuth(session=session, user=user)


PASSWORD_CHANGE_ALLOWED_PATHS = frozenset(
    {"/api/v1/me", "/api/v1/me/password", "/api/v1/auth/reauth", "/api/v1/auth/logout"}
)

Auth = Annotated[CurrentAuth, Depends(current_auth)]


async def current_admin(auth: Auth, db: DbSession) -> CurrentAuth:
    """Admin role required; admins manage accounts, never content (ADR-0005). When the instance requires 2FA for
    admins (HAAL-162), admin endpoints stay closed until the admin has enabled TOTP."""
    if auth.user.role != "admin":
        raise ProblemError(403, ProblemCode.FORBIDDEN, "Administrator role required")
    if await service.admin_2fa_missing(db, auth.user):
        raise ProblemError(
            403, ProblemCode.TOTP_REQUIRED, "Enable two-factor authentication to use admin functions"
        )
    return auth


Admin = Annotated[CurrentAuth, Depends(current_admin)]
