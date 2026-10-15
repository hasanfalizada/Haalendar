"""Accounts HTTP endpoints (contract: api/modules/accounts.yaml — auth_register, auth_verify_email, auth_login,
auth_logout, me, auth_password_reset_request/confirm, auth_reauth, me_password; admin.yaml admin_user_action).

+++===+++ 2026-10-15 — Hasan Alizada — HAAL-160. The session cookie is `__Host-haalendar_session`: Secure, HttpOnly,
SameSite=Lax, Path=/, no Domain, lifetime = absolute session expiry.
+++===+++ 2026-10-15 — Hasan Alizada — HAAL-161. Password reset, re-authentication, password change, admin reset.
+++===+++ 2026-10-15 — Hasan Alizada — HAAL-162. Second factor at login, TOTP enrolment, admin unlock.
+++===+++ 2026-10-15 — Hasan Alizada — HAAL-163. First-run setup (setup_status, setup_admin).
"""

from __future__ import annotations

import uuid
from datetime import UTC

from fastapi import APIRouter, Request, Response, status

from haalendar.accounts import service
from haalendar.accounts.models import AuthSession, UserAccount
from haalendar.accounts.schemas import (
    AdminUserActionOut,
    ChangePasswordIn,
    LoginIn,
    LoginOut,
    MeOut,
    PasswordResetConfirmIn,
    PasswordResetRequestIn,
    ReauthIn,
    RegistrationIn,
    SetupAdminIn,
    SetupStatusOut,
    TokenIn,
    TotpEnableIn,
    TotpEnableOut,
    TotpSetupOut,
)
from haalendar.deps import SESSION_COOKIE, Admin, AppMailer, AppSettings, Auth, DbSession

auth_router = APIRouter(prefix="/auth", tags=["auth"])
me_router = APIRouter(tags=["account"])
admin_router = APIRouter(prefix="/admin", tags=["admin"])
setup_router = APIRouter(prefix="/setup", tags=["setup"])


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
        totp_code=body.totp_code,
        recovery_code=body.recovery_code,
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


@auth_router.post(
    "/password-reset/request", status_code=status.HTTP_202_ACCEPTED, operation_id="requestPasswordReset"
)
async def request_password_reset(
    body: PasswordResetRequestIn, db: DbSession, mailer: AppMailer, settings: AppSettings
) -> None:
    await service.request_password_reset(db, mailer, settings, str(body.email))


@auth_router.post(
    "/password-reset/confirm", status_code=status.HTTP_204_NO_CONTENT, operation_id="confirmPasswordReset"
)
async def confirm_password_reset(body: PasswordResetConfirmIn, db: DbSession, mailer: AppMailer) -> None:
    await service.confirm_password_reset(db, mailer, body.token, body.new_password)


@auth_router.post("/reauth", status_code=status.HTTP_204_NO_CONTENT, operation_id="reauthenticate")
async def reauthenticate(body: ReauthIn, auth: Auth, db: DbSession) -> None:
    await service.reauthenticate(db, auth.session, auth.user, body.password)


@me_router.post("/me/password", status_code=status.HTTP_204_NO_CONTENT, operation_id="changePassword")
async def change_password(body: ChangePasswordIn, auth: Auth, db: DbSession, mailer: AppMailer) -> None:
    await service.change_password(db, mailer, auth.session, auth.user, body.new_password)


@admin_router.post("/users/{id}/reset-password", operation_id="adminUserAction")
async def admin_reset_password(
    id: uuid.UUID, admin: Admin, db: DbSession, mailer: AppMailer, settings: AppSettings
) -> AdminUserActionOut:
    service.require_recent_reauth(admin.session)
    result = await service.admin_reset_password(db, mailer, settings, admin.user, id)
    return AdminUserActionOut(delivery=result.delivery, one_time_password=result.one_time_password)


@me_router.post("/me/totp/setup", operation_id="startTotpSetup")
async def totp_setup(auth: Auth, settings: AppSettings) -> TotpSetupOut:
    uri, secret = await service.totp_setup(settings, auth.session, auth.user)
    return TotpSetupOut(otpauth_uri=uri, secret=secret)


@me_router.post("/me/totp/enable", operation_id="enableTotp")
async def totp_enable(
    body: TotpEnableIn, auth: Auth, db: DbSession, mailer: AppMailer, settings: AppSettings
) -> TotpEnableOut:
    codes = await service.totp_enable(db, mailer, settings, auth.user, body.totp_code)
    return TotpEnableOut(recovery_codes=codes)


@me_router.post("/me/totp/disable", status_code=status.HTTP_204_NO_CONTENT, operation_id="disableTotp")
async def totp_disable(auth: Auth, db: DbSession, mailer: AppMailer) -> None:
    await service.totp_disable(db, mailer, auth.session, auth.user)


@admin_router.post("/users/{id}/unlock", operation_id="adminUnlockUser")
async def admin_unlock(id: uuid.UUID, admin: Admin, db: DbSession) -> AdminUserActionOut:
    service.require_recent_reauth(admin.session)
    await service.admin_unlock(db, admin.user, id)
    return AdminUserActionOut()


@setup_router.get("/status", operation_id="getSetupStatus")
async def setup_status(db: DbSession, settings: AppSettings) -> SetupStatusOut:
    mode = await service.get_registration_mode(db)
    return SetupStatusOut(
        setup_required=not await service.admin_exists(db),
        setup_token_required=service.setup_token_required(settings),
        registration_mode="open" if mode == "open" else "invite",
        demo_mode=settings.demo_mode,
    )


@setup_router.post("/admin", status_code=status.HTTP_201_CREATED, operation_id="createFirstAdmin")
async def setup_admin(
    body: SetupAdminIn, request: Request, response: Response, db: DbSession, settings: AppSettings
) -> MeOut:
    result = await service.create_first_admin(
        db,
        settings,
        email=str(body.email),
        password=body.password,
        display_name=body.display_name,
        time_zone=body.time_zone,
        setup_token=body.setup_token,
        user_agent=request.headers.get("user-agent"),
        client_ip=request.client.host if request.client else None,
    )
    _set_session_cookie(response, result.token, result.session)
    return to_me(result.user, csrf_token=result.session.csrf_secret)
