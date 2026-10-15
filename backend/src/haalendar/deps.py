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
from sqlalchemy.ext.asyncio import AsyncSession

from haalendar.accounts import crypto, service
from haalendar.accounts.mailer import Mailer
from haalendar.accounts.models import AuthSession, UserAccount
from haalendar.config import Settings
from haalendar.errors import ProblemCode, ProblemError
from haalendar.security.guards import UNSAFE_METHODS

SESSION_COOKIE = "__Host-haalendar_session"
CSRF_HEADER = "x-csrf-token"


async def get_db(request: Request) -> AsyncIterator[AsyncSession]:
    async with request.app.state.session_factory() as session:
        try:
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


DbSession = Annotated[AsyncSession, Depends(get_db)]
AppSettings = Annotated[Settings, Depends(get_settings_dep)]
AppMailer = Annotated[Mailer, Depends(get_mailer)]


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
    return CurrentAuth(session=session, user=user)


Auth = Annotated[CurrentAuth, Depends(current_auth)]
