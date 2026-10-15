"""Accounts HTTP endpoints (contract: api/modules/accounts.yaml — auth_register, auth_verify_email, auth_login,
auth_logout, me).

+++===+++ 2026-10-15 — Hasan Alizada — HAAL-160. The session cookie is `__Host-haalendar_session`: Secure, HttpOnly,
SameSite=Lax, Path=/, no Domain, lifetime = absolute session expiry.
"""

from __future__ import annotations

from datetime import UTC

from fastapi import APIRouter, Request, Response, status

from haalendar.accounts import service
from haalendar.accounts.models import AuthSession, UserAccount
from haalendar.accounts.schemas import LoginIn, LoginOut, MeOut, RegistrationIn, TokenIn
from haalendar.deps import SESSION_COOKIE, AppMailer, AppSettings, Auth, DbSession

auth_router = APIRouter(prefix="/auth", tags=["auth"])
me_router = APIRouter(tags=["account"])


def to_me(user: UserAccount, csrf_token: str | None = None) -> MeOut:
    return MeOut(
        id=user.id,
        email=user.email,
        display_name=user.display_name,
        avatar_url=None,
        role="admin" if user.role == "admin" else "user",
        time_zone=user.time_zone,
        locale="en",
        totp_enabled=user.totp_enabled_at is not None,
        must_change_password=user.must_change_password,
        csrf_token=csrf_token,
        version=user.version,
    )


def _set_session_cookie(response: Response, token: str, session: AuthSession) -> None:
    max_age = int((session.absolute_expires_at - service.utcnow()).total_seconds())
    response.set_cookie(
        SESSION_COOKIE,
        token,
        max_age=max_age,
        expires=session.absolute_expires_at.astimezone(UTC),
        path="/",
        secure=True,
        httponly=True,
        samesite="lax",
    )


@auth_router.post("/register", status_code=status.HTTP_202_ACCEPTED, operation_id="register")
async def register(body: RegistrationIn, db: DbSession, mailer: AppMailer, settings: AppSettings) -> None:
    await service.register(
        db,
        mailer,
        settings,
        email=str(body.email),
        password=body.password,
        display_name=body.display_name,
        time_zone=body.time_zone,
        invite_token=body.invite_token,
    )


@auth_router.post("/verify-email", status_code=status.HTTP_204_NO_CONTENT, operation_id="verifyEmail")
async def verify_email(body: TokenIn, db: DbSession) -> None:
    await service.verify_email(db, body.token)


@auth_router.post("/login", operation_id="login")
async def login(
    body: LoginIn, request: Request, response: Response, db: DbSession, settings: AppSettings
) -> LoginOut:
    result = await service.login(
        db,
        settings,
        email=str(body.email),
        password=body.password,
        user_agent=request.headers.get("user-agent"),
        client_ip=request.client.host if request.client else None,
    )
    _set_session_cookie(response, result.token, result.session)
    return LoginOut(me=to_me(result.user), csrf_token=result.session.csrf_secret)


@auth_router.post("/logout", status_code=status.HTTP_204_NO_CONTENT, operation_id="logout")
async def logout(auth: Auth, response: Response) -> None:
    await service.logout(auth.session)
    response.delete_cookie(SESSION_COOKIE, path="/", secure=True, httponly=True, samesite="lax")


@me_router.get("/me", operation_id="getMe")
async def get_me(auth: Auth) -> MeOut:
    return to_me(auth.user, csrf_token=auth.session.csrf_secret)
