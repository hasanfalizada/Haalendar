"""Accounts HTTP endpoints (contract: api/modules/accounts.yaml — auth_register, auth_verify_email, auth_login,
auth_logout, me, auth_password_reset_request/confirm, auth_reauth, me_password; admin.yaml admin_user_action).

+++===+++ 2026-10-15 — Hasan Alizada — HAAL-160. The session cookie is `__Host-haalendar_session`: Secure, HttpOnly,
SameSite=Lax, Path=/, no Domain, lifetime = absolute session expiry.
+++===+++ 2026-10-15 — Hasan Alizada — HAAL-161. Password reset, re-authentication, password change, admin reset.
+++===+++ 2026-10-15 — Hasan Alizada — HAAL-162. Second factor at login, TOTP enrolment, admin unlock.
+++===+++ 2026-10-15 — Hasan Alizada — HAAL-163. First-run setup (setup_status, setup_admin).
+++===+++ 2026-10-15 — Hasan Alizada — HAAL-171. Verification resend, recovery codes, own sessions, instance settings.
+++===+++ 2026-10-15 — Hasan Alizada — HAAL-166. Profile (me PATCH), avatar upload/removal (me_avatar) and avatar
download (user_avatar).
+++===+++ 2026-10-15 — Hasan Alizada — HAAL-164. Admin panel (admin.yaml admin_users, admin_user, admin_user_action,
admin_invites, admin_invite) and the invitation page (auth_invite_info). Every admin mutation requires re-auth.
"""

from __future__ import annotations

import uuid
from datetime import UTC
from typing import Annotated, Literal

from fastapi import APIRouter, Header, Query, Request, Response, status

from haalendar.accounts import service
from haalendar.accounts.models import AuthSession, InstanceSettings
from haalendar.accounts.schemas import (
    AdminInviteCreatedOut,
    AdminInviteIn,
    AdminInviteListOut,
    AdminUserActionOut,
    AdminUserOut,
    AdminUserPageOut,
    AdminUserPatchIn,
    ChangePasswordIn,
    EmailIn,
    InstanceSettingsOut,
    InstanceSettingsPatchIn,
    InviteInfoOut,
    LoginIn,
    LoginOut,
    MeOut,
    PasswordResetConfirmIn,
    PasswordResetRequestIn,
    ProfilePatchIn,
    ReauthIn,
    RecoveryCodesOut,
    RegistrationIn,
    SessionListOut,
    SessionOut,
    SetupAdminIn,
    SetupStatusOut,
    TokenIn,
    TotpEnableIn,
    TotpEnableOut,
    TotpSetupOut,
    UserStatus,
)
from haalendar.api.preconditions import expected_version
from haalendar.config import Settings
from haalendar.deps import SESSION_COOKIE, Admin, AppMailer, AppSettings, AppStorage, Auth, DbSession
from haalendar.errors import ProblemCode, ProblemError

auth_router = APIRouter(prefix="/auth", tags=["auth"])
me_router = APIRouter(tags=["account"])
admin_router = APIRouter(prefix="/admin", tags=["admin"])
setup_router = APIRouter(prefix="/setup", tags=["setup"])
users_router = APIRouter(prefix="/users", tags=["account"])


to_me = service.to_me


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


# +++===+++ 2026-10-15 — Hasan Alizada — HAAL-164. Admin panel and invitation page.


@auth_router.post("/invite-info", operation_id="getInviteInfo")
async def get_invite_info(body: TokenIn, db: DbSession) -> InviteInfoOut:
    invite = await service.invite_info(db, body.token)
    return InviteInfoOut(email=invite.email, expires_at=invite.expires_at)


@admin_router.get("/users", operation_id="adminListUsers")
async def admin_list_users(
    admin: Admin,
    db: DbSession,
    cursor: Annotated[str | None, Query(max_length=512)] = None,
    limit: Annotated[int, Query(ge=1, le=200)] = 50,
    q: Annotated[str | None, Query(max_length=100)] = None,
    status: Annotated[UserStatus | None, Query()] = None,
) -> AdminUserPageOut:
    page = await service.admin_list_users(db, q=q, status=status, cursor=cursor, limit=limit)
    return AdminUserPageOut(data=[service.to_admin_user(u) for u in page.users], next_cursor=page.next_cursor)


@admin_router.patch("/users/{id}", operation_id="adminUpdateUser")
async def admin_update_user(
    id: uuid.UUID,
    body: AdminUserPatchIn,
    response: Response,
    admin: Admin,
    db: DbSession,
    if_match: Annotated[str | None, Header()] = None,
) -> AdminUserOut:
    service.require_recent_reauth(admin.session)
    expected = expected_version(if_match)
    user = await service.admin_set_role(db, admin.user, id, body.role, expected)
    response.headers["ETag"] = f'"{user.version}"'
    return service.to_admin_user(user)


@admin_router.post("/users/{id}/{action}", operation_id="adminUserAction", response_model_exclude_none=True)
async def admin_user_action(
    id: uuid.UUID,
    action: Literal["deactivate", "reactivate", "unlock", "reset-password"],
    admin: Admin,
    db: DbSession,
    mailer: AppMailer,
    settings: AppSettings,
) -> AdminUserActionOut:
    service.require_recent_reauth(admin.session)
    result = await service.admin_user_action(db, mailer, settings, admin.user, id, action)
    return AdminUserActionOut(
        user=service.to_admin_user(result.user),
        delivery=result.delivery,
        one_time_password=result.one_time_password,
    )


@admin_router.get("/invites", operation_id="adminListInvites")
async def admin_list_invites(admin: Admin, db: DbSession) -> AdminInviteListOut:
    return AdminInviteListOut(data=[service.to_admin_invite(i) for i in await service.admin_list_invites(db)])


@admin_router.post(
    "/invites",
    status_code=status.HTTP_201_CREATED,
    operation_id="adminInviteUser",
    response_model_exclude_none=True,
)
async def admin_invite_user(
    body: AdminInviteIn,
    admin: Admin,
    db: DbSession,
    mailer: AppMailer,
    settings: AppSettings,
    idempotency_key: Annotated[uuid.UUID | None, Header()] = None,
) -> AdminInviteCreatedOut:
    # Idempotency-Key is accepted per contract; a repeated invitation is already safe (it supersedes the previous one).
    service.require_recent_reauth(admin.session)
    result = await service.admin_invite(
        db,
        mailer,
        settings,
        admin.user,
        email=str(body.email),
        role=body.role,
        display_name=body.display_name,
    )
    return AdminInviteCreatedOut(
        delivery=result.delivery,
        invite=service.to_admin_invite(result.invite) if result.invite else None,
        user=service.to_admin_user(result.user) if result.user else None,
        one_time_password=result.one_time_password,
    )


@admin_router.delete(
    "/invites/{id}", status_code=status.HTTP_204_NO_CONTENT, operation_id="adminRevokeInvite"
)
async def admin_revoke_invite(id: uuid.UUID, admin: Admin, db: DbSession) -> None:
    service.require_recent_reauth(admin.session)
    await service.admin_revoke_invite(db, admin.user, id)


# +++===+++ 2026-10-15 — Hasan Alizada — HAAL-166. Profile and avatar.

AVATAR_CACHE = "private, max-age=31536000, immutable"


@me_router.patch("/me", operation_id="updateProfile")
async def update_profile(
    body: ProfilePatchIn,
    response: Response,
    auth: Auth,
    db: DbSession,
    if_match: Annotated[str | None, Header()] = None,
) -> MeOut:
    user = await service.update_profile(
        db,
        auth.user,
        expected_version=expected_version(if_match),
        display_name=body.display_name,
        time_zone=body.time_zone,
    )
    response.headers["ETag"] = f'"{user.version}"'
    return to_me(user, csrf_token=auth.session.csrf_secret)


@me_router.put("/me/avatar", operation_id="uploadAvatar")
async def upload_avatar(request: Request, auth: Auth, db: DbSession, storage: AppStorage) -> MeOut:
    user = await service.set_avatar(db, storage, auth.user, await request.body())
    return to_me(user, csrf_token=auth.session.csrf_secret)


@me_router.delete("/me/avatar", operation_id="removeAvatar")
async def remove_avatar(auth: Auth, db: DbSession) -> MeOut:
    user = await service.remove_avatar(db, auth.user)
    return to_me(user, csrf_token=auth.session.csrf_secret)


@users_router.get(
    "/{id}/avatar",
    operation_id="getUserAvatar",
    response_class=Response,
    responses={200: {"content": {"image/webp": {}}}},
)
async def get_user_avatar(
    id: uuid.UUID,
    auth: Auth,
    db: DbSession,
    storage: AppStorage,
    v: Annotated[str | None, Query(max_length=64)] = None,
) -> Response:
    data = await service.avatar_bytes(db, storage, id)
    if data is None:
        raise ProblemError(404, ProblemCode.NOT_FOUND, "No avatar")
    return Response(
        content=data,
        media_type=service.AVATAR_MEDIA_TYPE,
        headers={"Cache-Control": AVATAR_CACHE, "Content-Disposition": 'inline; filename="avatar.webp"'},
    )


# +++===+++ 2026-10-15 — Hasan Alizada — HAAL-171. Remaining self-service and instance settings.


@auth_router.post(
    "/verify-email/resend", status_code=status.HTTP_202_ACCEPTED, operation_id="resendVerificationEmail"
)
async def resend_verification_email(
    body: EmailIn, db: DbSession, mailer: AppMailer, settings: AppSettings
) -> None:
    await service.resend_verification(db, mailer, settings, str(body.email))


@me_router.post("/me/totp/recovery-codes", operation_id="regenerateRecoveryCodes")
async def regenerate_recovery_codes(auth: Auth, db: DbSession) -> RecoveryCodesOut:
    return RecoveryCodesOut(
        recovery_codes=await service.regenerate_recovery_codes(db, auth.session, auth.user)
    )


@me_router.get("/me/sessions", operation_id="listSessions")
async def list_sessions(auth: Auth, db: DbSession) -> SessionListOut:
    sessions = await service.list_sessions(db, auth.user.id)
    return SessionListOut(
        data=[
            SessionOut(
                id=s.id,
                created_at=s.created_at,
                last_seen_at=s.last_seen_at,
                device=service.device_summary(s.user_agent),
                ip_prefix=s.ip_prefix,
                current=s.id == auth.session.id,
            )
            for s in sessions
        ]
    )


@me_router.delete("/me/sessions/{id}", status_code=status.HTTP_204_NO_CONTENT, operation_id="revokeSession")
async def revoke_session(id: uuid.UUID, auth: Auth, db: DbSession) -> None:
    await service.revoke_own_session(db, auth.user.id, id)


@me_router.post(
    "/me/sessions/revoke-others", status_code=status.HTTP_204_NO_CONTENT, operation_id="revokeOtherSessions"
)
async def revoke_other_sessions(auth: Auth, db: DbSession) -> None:
    await service.revoke_sessions(db, auth.user.id, keep=auth.session.id)


def _instance_settings_out(row: InstanceSettings, settings: Settings) -> InstanceSettingsOut:
    return InstanceSettingsOut(
        registration_mode="open" if row.registration_mode == "open" else "invite",
        require_admin_2fa=row.require_admin_2fa,
        demo_mode=settings.demo_mode,
        smtp_configured=bool(settings.smtp_host),
        version=row.version,
    )


@admin_router.get("/settings", operation_id="adminGetInstanceSettings")
async def admin_get_instance_settings(
    admin: Admin, db: DbSession, settings: AppSettings
) -> InstanceSettingsOut:
    return _instance_settings_out(await service.get_instance_settings(db), settings)


@admin_router.patch("/settings", operation_id="adminUpdateInstanceSettings")
async def admin_update_instance_settings(
    body: InstanceSettingsPatchIn,
    response: Response,
    admin: Admin,
    db: DbSession,
    settings: AppSettings,
    if_match: Annotated[str | None, Header()] = None,
) -> InstanceSettingsOut:
    service.require_recent_reauth(admin.session)
    row = await service.update_instance_settings(
        db,
        admin.user,
        expected_version=expected_version(if_match),
        registration_mode=body.registration_mode,
        require_admin_2fa=body.require_admin_2fa,
    )
    response.headers["ETag"] = f'"{row.version}"'
    return _instance_settings_out(row, settings)
