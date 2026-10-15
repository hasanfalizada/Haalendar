"""Account use cases: invitations, registration, e-mail verification, login, session resolution, logout.

+++===+++ 2026-10-15 — Hasan Alizada — HAAL-160. Rules from ADR-0005 / SRS FR-ACC-01..02:
- invite-only by default; open registration is an instance setting;
- generic outcomes that never reveal whether an e-mail is registered (no account enumeration);
- an invitation proves e-mail ownership, open registration requires the 24 h verification link;
- server-side sessions: 256-bit token in a __Host- cookie, only its hash stored, idle 30 d sliding, absolute 90 d;
- every security event is logged with ids only (no e-mail addresses, passwords or tokens).
"""

from __future__ import annotations

import asyncio
import base64
import ipaddress
import secrets
import uuid
import zoneinfo
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from functools import lru_cache
from typing import Literal

import pyotp
from sqlalchemy import func, or_, select, text, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from haalendar.accounts import crypto
from haalendar.accounts.avatar import process_avatar
from haalendar.accounts.mailer import Mailer
from haalendar.accounts.models import AuthSession, AuthToken, InstanceSettings, RecoveryCode, UserAccount
from haalendar.accounts.schemas import AdminInviteOut, AdminUserOut, MeOut, UserStatus
from haalendar.atoms.accounts.password_policy import check_password
from haalendar.config import Settings
from haalendar.errors import ProblemCode, ProblemError
from haalendar.logging import get_logger
from haalendar.storage import Storage

log = get_logger(__name__)

VERIFY_TOKEN_TTL = timedelta(hours=24)
INVITE_TOKEN_TTL = timedelta(days=7)
SESSION_TOUCH_INTERVAL = timedelta(minutes=5)


def utcnow() -> datetime:
    return datetime.now(UTC)


@lru_cache(maxsize=1)
def _time_zones() -> frozenset[str]:
    return frozenset(zoneinfo.available_timezones())


def ip_prefix(ip: str | None) -> str | None:
    """Privacy-preserving network prefix: /24 for IPv4, /48 for IPv6."""
    if not ip:
        return None
    try:
        address = ipaddress.ip_address(ip)
    except ValueError:
        return None
    bits = 24 if address.version == 4 else 48
    return str(ipaddress.ip_network(f"{address}/{bits}", strict=False))


def _password_problem(violations: list[str]) -> ProblemError:
    return ProblemError(
        422,
        ProblemCode.VALIDATION_FAILED,
        "The password does not meet the password policy",
        errors=[{"pointer": "/password", "detail": v, "code": v} for v in violations],
    )


async def _find_user_by_email(db: AsyncSession, email: str) -> UserAccount | None:
    result = await db.execute(
        select(UserAccount).where(func.lower(UserAccount.email) == email.strip().lower())
    )
    return result.scalar_one_or_none()


async def get_registration_mode(db: AsyncSession) -> str:
    mode = await db.scalar(select(InstanceSettings.registration_mode).where(InstanceSettings.id == 1))
    return mode or "invite"


async def create_invite(
    db: AsyncSession, email: str, role: str = "user", created_by: uuid.UUID | None = None
) -> str:
    """Create an invitation and return the raw token (the admin panel e-mails it, see admin_invite)."""
    token, _ = await _new_invite(db, email, role, created_by)
    return token


async def _new_invite(
    db: AsyncSession, email: str, role: str, created_by: uuid.UUID | None
) -> tuple[str, AuthToken]:
    token = crypto.new_token()
    record = AuthToken(
        email=email.strip(),
        purpose="invite",
        role=role,
        token_hash=crypto.token_digest(token),
        expires_at=utcnow() + INVITE_TOKEN_TTL,
        created_by=created_by,
    )
    db.add(record)
    await db.flush()
    log.info(
        "invite_created",
        invite_id=str(record.id),
        role=role,
        created_by=str(created_by) if created_by else None,
    )
    return token, record


async def _pending_invite(db: AsyncSession, token: str) -> AuthToken | None:
    """Unused, unrevoked, unexpired invitation for a raw token."""
    result: AuthToken | None = await db.scalar(
        select(AuthToken).where(
            AuthToken.token_hash == crypto.token_digest(token),
            AuthToken.purpose == "invite",
            AuthToken.used_at.is_(None),
            AuthToken.revoked_at.is_(None),
            AuthToken.expires_at > utcnow(),
        )
    )
    return result


async def invite_info(db: AsyncSession, token: str) -> AuthToken:
    """Invitation page (HAAL-164): show the invited address before registration; 400 when not usable."""
    invite = await _pending_invite(db, token)
    if invite is None:
        log.info("invite_info_invalid")
        raise ProblemError(400, ProblemCode.BAD_REQUEST, "The invitation is invalid or has expired")
    return invite


async def register(
    db: AsyncSession,
    mailer: Mailer,
    settings: Settings,
    *,
    email: str,
    password: str,
    display_name: str,
    time_zone: str,
    invite_token: str | None,
) -> None:
    """Register an account. Returns nothing on purpose: the HTTP layer always answers 202."""
    email = email.strip()
    if time_zone not in _time_zones():
        raise ProblemError(
            422,
            ProblemCode.VALIDATION_FAILED,
            "Unknown time zone",
            errors=[{"pointer": "/time_zone", "detail": "Use an IANA time zone, e.g. Europe/Berlin"}],
        )
    violations = check_password(password, email, display_name)
    if violations:
        raise _password_problem(list(violations))

    invite: AuthToken | None = None
    if invite_token:
        invite = await _pending_invite(db, invite_token)
        if invite is None or invite.email.lower() != email.lower():
            log.warning("register_invalid_invite")
            raise ProblemError(400, ProblemCode.BAD_REQUEST, "The invitation is invalid or has expired")
    elif await get_registration_mode(db) == "invite":
        log.info("register_rejected_invite_only")
        raise ProblemError(403, ProblemCode.FORBIDDEN, "Registration requires an invitation")

    existing = await _find_user_by_email(db, email)
    if existing is not None:
        # Same response as a fresh registration; the owner is informed instead of the requester.
        log.info("register_existing_email", user_id=str(existing.id))
        await mailer.send(
            existing.email,
            "Haalendar: registration attempt",
            "Someone tried to create a Haalendar account with your e-mail address.\n"
            "If this was you, sign in instead or reset your password. Otherwise you can ignore this message.\n",
        )
        return

    now = utcnow()
    user = UserAccount(
        email=email,
        password_hash=crypto.hash_password(password),
        display_name=display_name.strip(),
        time_zone=time_zone,
        role=invite.role if invite is not None and invite.role else "user",
        email_verified_at=now if invite is not None else None,
    )
    db.add(user)
    await db.flush()

    if invite is not None:
        invite.used_at = now
        invite.user_id = user.id
        log.info("user_registered", user_id=str(user.id), via="invite", role=user.role)
        return

    log.info("user_registered", user_id=str(user.id), via="open")
    await _send_verification(db, mailer, settings, user)


async def _send_verification(db: AsyncSession, mailer: Mailer, settings: Settings, user: UserAccount) -> None:
    """Issue a 24 h verification link (HAAL-171: older pending links of the account are revoked) and e-mail it."""
    now = utcnow()
    await db.execute(
        update(AuthToken)
        .where(
            AuthToken.user_id == user.id,
            AuthToken.purpose == "email_verify",
            AuthToken.used_at.is_(None),
            AuthToken.revoked_at.is_(None),
        )
        .values(revoked_at=now)
    )
    verify_token = crypto.new_token()
    db.add(
        AuthToken(
            user_id=user.id,
            email=user.email,
            purpose="email_verify",
            token_hash=crypto.token_digest(verify_token),
            expires_at=now + VERIFY_TOKEN_TTL,
        )
    )
    await db.flush()
    await mailer.send(
        user.email,
        "Haalendar: confirm your e-mail address",
        f"Hello {user.display_name},\n\nconfirm your e-mail address to finish creating your Haalendar account:\n"
        f"{settings.public_url.rstrip('/')}/verify-email?token={verify_token}\n\n"
        "The link is valid for 24 hours. If you did not create an account, ignore this message.\n",
    )


async def verify_email(db: AsyncSession, token: str) -> None:
    record = await db.scalar(
        select(AuthToken).where(
            AuthToken.token_hash == crypto.token_digest(token),
            AuthToken.purpose == "email_verify",
            AuthToken.used_at.is_(None),
            AuthToken.revoked_at.is_(None),
            AuthToken.expires_at > utcnow(),
        )
    )
    if record is None or record.user_id is None:
        log.warning("email_verify_invalid_token")
        raise ProblemError(400, ProblemCode.BAD_REQUEST, "The link is invalid or has expired")
    now = utcnow()
    record.used_at = now
    await db.execute(
        update(UserAccount)
        .where(UserAccount.id == record.user_id, UserAccount.email_verified_at.is_(None))
        .values(email_verified_at=now, version=UserAccount.version + 1)
    )
    log.info("email_verified", user_id=str(record.user_id))


@dataclass(frozen=True, slots=True)
class LoginResult:
    user: UserAccount
    session: AuthSession
    token: str


async def login(
    db: AsyncSession,
    settings: Settings,
    *,
    email: str,
    password: str,
    user_agent: str | None,
    client_ip: str | None,
    totp_code: str | None = None,
    recovery_code: str | None = None,
) -> LoginResult:
    user = await _find_user_by_email(db, email)
    if user is None:
        crypto.burn_verification_time(password)
        log.info("login_failed", reason="unknown_email")
        raise ProblemError(401, ProblemCode.INVALID_CREDENTIALS, "E-mail or password is incorrect")
    _raise_if_locked(user, password)
    if not crypto.verify_password(user.password_hash, password) or user.deactivated_at is not None:
        await _register_failure(db, user, "password_or_deactivated")
        raise ProblemError(401, ProblemCode.INVALID_CREDENTIALS, "E-mail or password is incorrect")
    if user.email_verified_at is None:
        log.info("login_blocked_unverified", user_id=str(user.id))
        raise ProblemError(403, ProblemCode.EMAIL_NOT_VERIFIED, "Confirm your e-mail address first")
    if user.totp_enabled_at is not None:
        await _check_second_factor(db, settings, user, totp_code, recovery_code)

    if crypto.needs_rehash(user.password_hash):
        user.password_hash = crypto.hash_password(password)
        log.info("password_rehashed", user_id=str(user.id))
    now = utcnow()
    user.failed_login_count = 0
    user.locked_until = None
    user.last_login_at = now
    token = crypto.new_token()
    session = AuthSession(
        token_hash=crypto.token_digest(token),
        user_id=user.id,
        last_seen_at=now,
        idle_expires_at=now + timedelta(days=settings.session_idle_days),
        absolute_expires_at=now + timedelta(days=settings.session_absolute_days),
        user_agent=(user_agent or "")[:200] or None,
        ip_prefix=ip_prefix(client_ip),
        csrf_secret=secrets.token_urlsafe(32),
        # A fresh login counts as re-authentication for the next 15 minutes (ADR-0005).
        reauth_at=now,
    )
    db.add(session)
    await db.flush()
    log.info("login_succeeded", user_id=str(user.id), session_id=str(session.id))
    return LoginResult(user=user, session=session, token=token)


async def resolve_session(
    db: AsyncSession, settings: Settings, token: str
) -> tuple[AuthSession, UserAccount] | None:
    """Valid, non-revoked, non-expired session of an active user; slides the idle expiry (at most every 5 min)."""
    now = utcnow()
    row = (
        await db.execute(
            select(AuthSession, UserAccount)
            .join(UserAccount, UserAccount.id == AuthSession.user_id)
            .where(
                AuthSession.token_hash == crypto.token_digest(token),
                AuthSession.revoked_at.is_(None),
                AuthSession.idle_expires_at > now,
                AuthSession.absolute_expires_at > now,
                UserAccount.deactivated_at.is_(None),
            )
        )
    ).one_or_none()
    if row is None:
        return None
    session, user = row
    if now - session.last_seen_at >= SESSION_TOUCH_INTERVAL:
        session.last_seen_at = now
        session.idle_expires_at = min(
            now + timedelta(days=settings.session_idle_days), session.absolute_expires_at
        )
    return session, user


async def logout(session: AuthSession) -> None:
    session.revoked_at = utcnow()
    log.info("logout", user_id=str(session.user_id), session_id=str(session.id))


# ---------------------------------------------------------------------------------------------------------------
# +++===+++ 2026-10-15 — Hasan Alizada — HAAL-161. Password reset (e-mail link, single use, 1 h), re-authentication,
# password change and manual reset by an admin. Every password change revokes sessions; reset links supersede
# older ones; requests are throttled per account to prevent e-mail bombing.
# ---------------------------------------------------------------------------------------------------------------

RESET_TOKEN_TTL = timedelta(hours=1)
RESET_RESEND_INTERVAL = timedelta(minutes=5)
REAUTH_WINDOW = timedelta(minutes=15)


async def revoke_sessions(db: AsyncSession, user_id: uuid.UUID, keep: uuid.UUID | None = None) -> None:
    statement = update(AuthSession).where(AuthSession.user_id == user_id, AuthSession.revoked_at.is_(None))
    if keep is not None:
        statement = statement.where(AuthSession.id != keep)
    await db.execute(statement.values(revoked_at=utcnow()))
    log.info("sessions_revoked", user_id=str(user_id), kept=str(keep) if keep else None)


async def _issue_reset_link(
    db: AsyncSession, mailer: Mailer, settings: Settings, user: UserAccount, created_by: uuid.UUID | None
) -> bool:
    now = utcnow()
    await db.execute(
        update(AuthToken)
        .where(
            AuthToken.user_id == user.id, AuthToken.purpose == "password_reset", AuthToken.used_at.is_(None)
        )
        .values(used_at=now)
    )
    token = crypto.new_token()
    db.add(
        AuthToken(
            user_id=user.id,
            email=user.email,
            purpose="password_reset",
            token_hash=crypto.token_digest(token),
            expires_at=now + RESET_TOKEN_TTL,
            created_by=created_by,
        )
    )
    await db.flush()
    return await mailer.send(
        user.email,
        "Haalendar: reset your password",
        f"Hello {user.display_name},\n\nuse this link to set a new password:\n"
        f"{settings.public_url.rstrip('/')}/reset-password?token={token}\n\n"
        "The link can be used once and is valid for 1 hour. If you did not request it, ignore this message;\n"
        "your password stays unchanged.\n",
    )


async def request_password_reset(db: AsyncSession, mailer: Mailer, settings: Settings, email: str) -> None:
    """Always succeeds from the caller's point of view (202); sends a link only to an existing active account."""
    user = await _find_user_by_email(db, email)
    if user is None or user.deactivated_at is not None:
        log.info("password_reset_requested", known=False)
        return
    recent = await db.scalar(
        select(AuthToken.id).where(
            AuthToken.user_id == user.id,
            AuthToken.purpose == "password_reset",
            AuthToken.used_at.is_(None),
            AuthToken.created_at > utcnow() - RESET_RESEND_INTERVAL,
        )
    )
    if recent is not None:
        log.info("password_reset_throttled", user_id=str(user.id))
        return
    await _issue_reset_link(db, mailer, settings, user, created_by=None)
    log.info("password_reset_requested", known=True, user_id=str(user.id))


async def _set_password(db: AsyncSession, user: UserAccount, new_password: str) -> None:
    violations = check_password(new_password, user.email, user.display_name)
    if violations:
        raise ProblemError(
            422,
            ProblemCode.VALIDATION_FAILED,
            "The password does not meet the password policy",
            errors=[{"pointer": "/new_password", "detail": v, "code": v} for v in violations],
        )
    user.password_hash = crypto.hash_password(new_password)
    user.must_change_password = False
    user.failed_login_count = 0
    user.version += 1


async def confirm_password_reset(db: AsyncSession, mailer: Mailer, token: str, new_password: str) -> None:
    record = await db.scalar(
        select(AuthToken).where(
            AuthToken.token_hash == crypto.token_digest(token),
            AuthToken.purpose == "password_reset",
            AuthToken.used_at.is_(None),
            AuthToken.expires_at > utcnow(),
        )
    )
    user = await db.get(UserAccount, record.user_id) if record is not None and record.user_id else None
    if record is None or user is None or user.deactivated_at is not None:
        log.warning("password_reset_invalid_token")
        raise ProblemError(400, ProblemCode.BAD_REQUEST, "The link is invalid or has expired")
    await _set_password(db, user, new_password)
    now = utcnow()
    record.used_at = now
    if user.email_verified_at is None:
        user.email_verified_at = now  # the link proved ownership of the address
    await revoke_sessions(db, user.id)
    log.info("password_reset_completed", user_id=str(user.id))
    await mailer.send(
        user.email,
        "Haalendar: your password was changed",
        "The password of your Haalendar account was changed and all sessions were signed out.\n"
        "If this was not you, reset your password immediately and contact your administrator.\n",
    )


async def reauthenticate(db: AsyncSession, session: AuthSession, user: UserAccount, password: str) -> None:
    if not crypto.verify_password(user.password_hash, password):
        user.failed_login_count += 1
        await db.commit()
        log.info("reauth_failed", user_id=str(user.id))
        raise ProblemError(401, ProblemCode.INVALID_CREDENTIALS, "The password is incorrect")
    session.reauth_at = utcnow()
    log.info("reauth_succeeded", user_id=str(user.id))


def require_recent_reauth(session: AuthSession) -> None:
    if session.reauth_at is None or utcnow() - session.reauth_at > REAUTH_WINDOW:
        raise ProblemError(403, ProblemCode.REAUTH_REQUIRED, "Confirm your password to continue")


async def change_password(
    db: AsyncSession, mailer: Mailer, session: AuthSession, user: UserAccount, new_password: str
) -> None:
    require_recent_reauth(session)
    await _set_password(db, user, new_password)
    await revoke_sessions(db, user.id, keep=session.id)
    log.info("password_changed", user_id=str(user.id))
    await mailer.send(
        user.email,
        "Haalendar: your password was changed",
        "The password of your Haalendar account was changed; other sessions were signed out.\n"
        "If this was not you, reset your password immediately and contact your administrator.\n",
    )


@dataclass(frozen=True, slots=True)
class AdminResetResult:
    delivery: Literal["email", "one_time_password"]
    one_time_password: str | None


async def admin_reset_password(
    db: AsyncSession, mailer: Mailer, settings: Settings, admin: UserAccount, user: UserAccount
) -> AdminResetResult:
    """With SMTP: e-mail a reset link. Without SMTP: return a one-time password that must be changed at login."""
    if user.deactivated_at is not None:
        raise ProblemError(
            409, ProblemCode.INVALID_STATE, "Reactivate the account before resetting its password"
        )
    await revoke_sessions(db, user.id)
    if settings.smtp_host:
        await _issue_reset_link(db, mailer, settings, user, created_by=admin.id)
        log.info("admin_password_reset", admin_id=str(admin.id), user_id=str(user.id), delivery="email")
        return AdminResetResult(delivery="email", one_time_password=None)
    one_time = secrets.token_urlsafe(15)
    user.password_hash = crypto.hash_password(one_time)
    user.must_change_password = True
    user.failed_login_count = 0
    user.version += 1
    log.info(
        "admin_password_reset", admin_id=str(admin.id), user_id=str(user.id), delivery="one_time_password"
    )
    return AdminResetResult(delivery="one_time_password", one_time_password=one_time)


# ---------------------------------------------------------------------------------------------------------------
# +++===+++ 2026-10-15 — Hasan Alizada — HAAL-162. Login protection (ADR-0005):
# - every 5th consecutive failure locks the account: 15 min, doubling, at most 24 h; never permanent; while locked the
#   password is not checked; success or an admin unlock resets the counter;
# - optional TOTP (RFC 6238, 30 s, ±1 step) with replay protection and 10 single-use recovery codes;
# - wrong second factors count as failures; a missing second factor does not (it is the normal two-step login).
# ---------------------------------------------------------------------------------------------------------------

LOCK_THRESHOLD = 5
LOCK_BASE = timedelta(minutes=15)
LOCK_MAX = timedelta(hours=24)
TOTP_ISSUER = "Haalendar"


def lock_duration(failed_count: int) -> timedelta | None:
    """Lock length after `failed_count` consecutive failures (None = no new lock)."""
    if failed_count < LOCK_THRESHOLD or failed_count % LOCK_THRESHOLD != 0:
        return None
    level = failed_count // LOCK_THRESHOLD - 1
    return min(LOCK_BASE * (1 << level), LOCK_MAX)


def _raise_if_locked(user: UserAccount, password: str) -> None:
    now = utcnow()
    if user.locked_until is not None and user.locked_until > now:
        crypto.burn_verification_time(password)  # same work as a normal attempt
        retry_after = int((user.locked_until - now).total_seconds()) + 1
        log.info("login_rejected_locked", user_id=str(user.id), retry_after_seconds=retry_after)
        raise ProblemError(
            429,
            ProblemCode.ACCOUNT_LOCKED,
            "Too many failed attempts. Try again later.",
            headers={"Retry-After": str(retry_after)},
        )


async def _register_failure(db: AsyncSession, user: UserAccount, reason: str) -> None:
    user.failed_login_count += 1
    duration = lock_duration(user.failed_login_count)
    if duration is not None:
        user.locked_until = utcnow() + duration
        log.warning(
            "account_locked",
            user_id=str(user.id),
            failed_count=user.failed_login_count,
            lock_minutes=int(duration.total_seconds() // 60),
        )
    # Persist even though the request fails.
    await db.commit()
    log.info("login_failed", user_id=str(user.id), reason=reason, failed_count=user.failed_login_count)


def _accepted_step(secret: str, code: str, last_step: int | None) -> int | None:
    """Time step matching `code` within ±1 step and newer than the last accepted one (replay protection)."""
    totp = pyotp.TOTP(secret)
    current = totp.timecode(utcnow())
    for step in (current - 1, current, current + 1):
        if last_step is not None and step <= last_step:
            continue
        if crypto.constant_time_equals(totp.generate_otp(step), code):
            return step
    return None


async def _check_second_factor(
    db: AsyncSession,
    settings: Settings,
    user: UserAccount,
    totp_code: str | None,
    recovery_code: str | None,
) -> None:
    if not totp_code and not recovery_code:
        log.info("login_totp_required", user_id=str(user.id))
        raise ProblemError(401, ProblemCode.TOTP_REQUIRED, "Enter the code from your authenticator app")
    if totp_code:
        secret = crypto.decrypt_secret(user.totp_secret_enc or "", settings.secret_key.get_secret_value())
        step = _accepted_step(secret, totp_code, user.totp_last_step)
        if step is None:
            await _register_failure(db, user, "totp_invalid")
            raise ProblemError(401, ProblemCode.INVALID_CREDENTIALS, "The verification code is incorrect")
        user.totp_last_step = step
        return
    digest = crypto.token_digest(crypto.normalize_recovery_code(recovery_code or ""))
    code_row = await db.scalar(
        select(RecoveryCode).where(
            RecoveryCode.user_id == user.id, RecoveryCode.code_hash == digest, RecoveryCode.used_at.is_(None)
        )
    )
    if code_row is None:
        await _register_failure(db, user, "recovery_code_invalid")
        raise ProblemError(401, ProblemCode.INVALID_CREDENTIALS, "The recovery code is incorrect")
    code_row.used_at = utcnow()
    log.info("recovery_code_used", user_id=str(user.id))


async def totp_setup(settings: Settings, session: AuthSession, user: UserAccount) -> tuple[str, str]:
    """Start enrolment: new pending secret; returns (otpauth URI for the QR code, secret for manual entry)."""
    require_recent_reauth(session)
    if user.totp_enabled_at is not None:
        raise ProblemError(409, ProblemCode.INVALID_STATE, "Two-factor authentication is already enabled")
    secret = pyotp.random_base32()
    user.totp_pending_secret_enc = crypto.encrypt_secret(secret, settings.secret_key.get_secret_value())
    log.info("totp_setup_started", user_id=str(user.id))
    return pyotp.TOTP(secret).provisioning_uri(name=user.email, issuer_name=TOTP_ISSUER), secret


async def totp_enable(
    db: AsyncSession, mailer: Mailer, settings: Settings, user: UserAccount, code: str
) -> list[str]:
    if user.totp_enabled_at is not None:
        raise ProblemError(409, ProblemCode.INVALID_STATE, "Two-factor authentication is already enabled")
    if user.totp_pending_secret_enc is None:
        raise ProblemError(409, ProblemCode.INVALID_STATE, "Start the setup first")
    secret = crypto.decrypt_secret(user.totp_pending_secret_enc, settings.secret_key.get_secret_value())
    step = _accepted_step(secret, code, None)
    if step is None:
        raise ProblemError(
            422,
            ProblemCode.VALIDATION_FAILED,
            "The verification code is incorrect",
            errors=[{"pointer": "/totp_code", "detail": "Code does not match"}],
        )
    user.totp_secret_enc = user.totp_pending_secret_enc
    user.totp_pending_secret_enc = None
    user.totp_enabled_at = utcnow()
    user.totp_last_step = step
    user.version += 1
    codes = await _replace_recovery_codes(db, user.id)
    log.info("totp_enabled", user_id=str(user.id))
    await mailer.send(
        user.email,
        "Haalendar: two-factor authentication enabled",
        "Two-factor authentication was enabled for your Haalendar account.\n"
        "If this was not you, reset your password immediately and contact your administrator.\n",
    )
    return codes


async def _replace_recovery_codes(db: AsyncSession, user_id: uuid.UUID) -> list[str]:
    await db.execute(
        update(RecoveryCode)
        .where(RecoveryCode.user_id == user_id, RecoveryCode.used_at.is_(None))
        .values(used_at=utcnow())
    )
    codes = crypto.new_recovery_codes()
    db.add_all(RecoveryCode(user_id=user_id, code_hash=crypto.token_digest(c)) for c in codes)
    await db.flush()
    return codes


async def totp_disable(db: AsyncSession, mailer: Mailer, session: AuthSession, user: UserAccount) -> None:
    require_recent_reauth(session)
    if user.role == "admin" and await _admin_2fa_required(db):
        raise ProblemError(
            403, ProblemCode.FORBIDDEN, "Administrators must keep two-factor authentication enabled"
        )
    user.totp_secret_enc = None
    user.totp_pending_secret_enc = None
    user.totp_enabled_at = None
    user.totp_last_step = None
    user.version += 1
    await db.execute(
        update(RecoveryCode)
        .where(RecoveryCode.user_id == user.id, RecoveryCode.used_at.is_(None))
        .values(used_at=utcnow())
    )
    log.info("totp_disabled", user_id=str(user.id))
    await mailer.send(
        user.email,
        "Haalendar: two-factor authentication disabled",
        "Two-factor authentication was disabled for your Haalendar account.\n"
        "If this was not you, reset your password immediately and contact your administrator.\n",
    )


async def _admin_2fa_required(db: AsyncSession) -> bool:
    return bool(await db.scalar(select(InstanceSettings.require_admin_2fa).where(InstanceSettings.id == 1)))


async def admin_2fa_missing(db: AsyncSession, user: UserAccount) -> bool:
    """True when the instance requires 2FA for admins and this admin has not enabled it."""
    return user.role == "admin" and user.totp_enabled_at is None and await _admin_2fa_required(db)


async def admin_unlock(admin: UserAccount, user: UserAccount) -> None:
    user.failed_login_count = 0
    user.locked_until = None
    log.info("admin_unlock", admin_id=str(admin.id), user_id=str(user.id))


# ---------------------------------------------------------------------------------------------------------------
# +++===+++ 2026-10-15 — Hasan Alizada — HAAL-163. Roles and first-run setup.
# - setup is pending while no admin account exists; the first admin is created through POST /setup/admin and is
#   signed in immediately (e-mail treated as verified: the operator owns the instance);
# - a setup token (HAALENDAR_SETUP_TOKEN) protects that window; it is mandatory in production so that nobody else
#   can claim a freshly started instance;
# - a transaction-level advisory lock serialises concurrent setup requests (exactly one admin is created);
# - the last active admin can never lose the role or be deactivated (assert_not_last_admin, see HAAL-164 below).
# ---------------------------------------------------------------------------------------------------------------

SETUP_LOCK_KEY = 0x48414C5345545550  # "HALSETUP"


async def admin_exists(db: AsyncSession) -> bool:
    found = await db.scalar(select(UserAccount.id).where(UserAccount.role == "admin").limit(1))
    return found is not None


def setup_token_required(settings: Settings) -> bool:
    return settings.setup_token is not None or settings.env.value == "production"


async def create_first_admin(
    db: AsyncSession,
    settings: Settings,
    *,
    email: str,
    password: str,
    display_name: str,
    time_zone: str,
    setup_token: str | None,
    user_agent: str | None,
    client_ip: str | None,
) -> LoginResult:
    if setup_token_required(settings):
        expected = settings.setup_token.get_secret_value() if settings.setup_token else None
        if expected is None:
            log.warning("setup_blocked_no_token_configured")
            raise ProblemError(
                403,
                ProblemCode.FORBIDDEN,
                "Set HAALENDAR_SETUP_TOKEN on the server to create the first administrator",
            )
        if not setup_token or not crypto.constant_time_equals(setup_token, expected):
            log.warning("setup_rejected_invalid_token")
            raise ProblemError(403, ProblemCode.FORBIDDEN, "The setup token is invalid")
    await db.execute(text("SELECT pg_advisory_xact_lock(:key)"), {"key": SETUP_LOCK_KEY})
    if await admin_exists(db):
        log.info("setup_rejected_already_done")
        raise ProblemError(409, ProblemCode.INVALID_STATE, "Setup is already complete")
    if time_zone not in _time_zones():
        raise ProblemError(
            422,
            ProblemCode.VALIDATION_FAILED,
            "Unknown time zone",
            errors=[{"pointer": "/time_zone", "detail": "Use an IANA time zone, e.g. Europe/Berlin"}],
        )
    violations = check_password(password, email, display_name)
    if violations:
        raise _password_problem(list(violations))
    if await _find_user_by_email(db, email) is not None:
        raise ProblemError(409, ProblemCode.DUPLICATE, "An account with this e-mail already exists")
    user = UserAccount(
        email=email.strip(),
        password_hash=crypto.hash_password(password),
        display_name=display_name.strip(),
        time_zone=time_zone,
        role="admin",
        email_verified_at=utcnow(),
    )
    db.add(user)
    await db.flush()
    log.info("first_admin_created", user_id=str(user.id))
    return await login(
        db, settings, email=user.email, password=password, user_agent=user_agent, client_ip=client_ip
    )


async def assert_not_last_admin(db: AsyncSession, user_id: uuid.UUID) -> None:
    """Raise 409 if `user_id` is the only active admin (before a role downgrade or deactivation)."""
    other_admin = await db.scalar(
        select(UserAccount.id)
        .where(UserAccount.role == "admin", UserAccount.deactivated_at.is_(None), UserAccount.id != user_id)
        .limit(1)
    )
    if other_admin is None:
        log.warning("last_admin_protected", user_id=str(user_id))
        raise ProblemError(409, ProblemCode.INVALID_STATE, "The last active administrator cannot be changed")


# ---------------------------------------------------------------------------------------------------------------
# +++===+++ 2026-10-15 — Hasan Alizada — HAAL-164. Admin panel (FR-ACC-06, ADR-0005):
# - admins manage accounts, never content; every mutation needs a recent re-authentication (checked by the API layer)
#   and is logged with admin and target ids;
# - "not on yourself": an admin cannot change the own role, deactivate, unlock or reset the own account here, so
#   nobody locks themselves out by mistake (the own password is changed in the profile);
# - deactivation is soft: deactivated_at is set, all sessions are revoked, every piece of data stays;
# - role changes and deactivations run under one transaction-level advisory lock, so two admins demoting each
#   other at the same moment cannot leave the instance without an active admin;
# - invitations: with SMTP an e-mailed link (7 days; a new invitation revokes the previous one, revoked ones are
#   kept); without SMTP the account is created at once with a one-time password that must be changed at login.
# ---------------------------------------------------------------------------------------------------------------

ADMIN_LOCK_KEY = 0x48414C41444D494E  # "HALADMIN"
AdminAction = Literal["deactivate", "reactivate", "unlock", "reset-password"]


def user_status(user: UserAccount, now: datetime | None = None) -> UserStatus:
    """Derived status, most restrictive first: deactivated > locked > unverified > active."""
    now = now or utcnow()
    if user.deactivated_at is not None:
        return "deactivated"
    if user.locked_until is not None and user.locked_until > now:
        return "locked"
    if user.email_verified_at is None:
        return "unverified"
    return "active"


def to_admin_user(user: UserAccount) -> AdminUserOut:
    return AdminUserOut(
        id=user.id,
        email=user.email,
        display_name=user.display_name,
        role="admin" if user.role == "admin" else "user",
        status=user_status(user),
        totp_enabled=user.totp_enabled_at is not None,
        last_login_at=user.last_login_at,
        created_at=user.created_at,
        version=user.version,
    )


def to_admin_invite(invite: AuthToken) -> AdminInviteOut:
    return AdminInviteOut(
        id=invite.id,
        email=invite.email,
        role="admin" if invite.role == "admin" else "user",
        created_at=invite.created_at,
        expires_at=invite.expires_at,
    )


def encode_cursor(last_id: uuid.UUID) -> str:
    return base64.urlsafe_b64encode(last_id.bytes).decode().rstrip("=")


def decode_cursor(cursor: str) -> uuid.UUID:
    try:
        return uuid.UUID(bytes=base64.urlsafe_b64decode(cursor + "=" * (-len(cursor) % 4)))
    except ValueError:
        raise ProblemError(400, ProblemCode.BAD_REQUEST, "Invalid cursor") from None


def _like_pattern(term: str) -> str:
    escaped = term.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
    return f"%{escaped}%"


@dataclass(frozen=True, slots=True)
class UserPage:
    users: list[UserAccount]
    next_cursor: str | None


async def admin_list_users(
    db: AsyncSession, *, q: str | None, status: UserStatus | None, cursor: str | None, limit: int
) -> UserPage:
    """Users in creation order (UUIDv7), keyset-paginated; optional text and status filters."""
    now = utcnow()
    statement = select(UserAccount).order_by(UserAccount.id).limit(limit + 1)
    if cursor:
        statement = statement.where(UserAccount.id > decode_cursor(cursor))
    if q and q.strip():
        pattern = _like_pattern(q.strip())
        statement = statement.where(
            or_(
                UserAccount.email.ilike(pattern, escape="\\"),
                UserAccount.display_name.ilike(pattern, escape="\\"),
            )
        )
    active = UserAccount.deactivated_at.is_(None)
    unlocked = or_(UserAccount.locked_until.is_(None), UserAccount.locked_until <= now)
    if status == "deactivated":
        statement = statement.where(UserAccount.deactivated_at.is_not(None))
    elif status == "locked":
        statement = statement.where(active, UserAccount.locked_until > now)
    elif status == "unverified":
        statement = statement.where(active, unlocked, UserAccount.email_verified_at.is_(None))
    elif status == "active":
        statement = statement.where(active, unlocked, UserAccount.email_verified_at.is_not(None))
    users = list((await db.scalars(statement)).all())
    next_cursor = encode_cursor(users[limit - 1].id) if len(users) > limit else None
    return UserPage(users=users[:limit], next_cursor=next_cursor)


async def _lock_admin_changes(db: AsyncSession, admin: UserAccount) -> None:
    """Serialise role/status changes; afterwards re-check the caller, who may have been demoted while waiting."""
    await db.execute(text("SELECT pg_advisory_xact_lock(:key)"), {"key": ADMIN_LOCK_KEY})
    await db.refresh(admin)
    if admin.role != "admin" or admin.deactivated_at is not None:
        log.warning("admin_lost_role_while_waiting", admin_id=str(admin.id))
        raise ProblemError(403, ProblemCode.FORBIDDEN, "Administrator role required")


async def _target(db: AsyncSession, admin: UserAccount, target_id: uuid.UUID) -> UserAccount:
    user = await db.get(UserAccount, target_id, populate_existing=True)
    if user is None:
        raise ProblemError(404, ProblemCode.NOT_FOUND, "User not found")
    if user.id == admin.id:
        log.info("admin_self_action_refused", admin_id=str(admin.id))
        raise ProblemError(409, ProblemCode.INVALID_STATE, "This cannot be done to your own account")
    return user


async def admin_set_role(
    db: AsyncSession, admin: UserAccount, target_id: uuid.UUID, role: str | None, expected_version: int
) -> UserAccount:
    """Merge-patch of the role; an empty patch only checks the version (and returns the current state)."""
    await _lock_admin_changes(db, admin)
    user = await _target(db, admin, target_id)
    if user.version != expected_version:
        raise ProblemError(
            412,
            ProblemCode.VERSION_CONFLICT,
            "The user was changed meanwhile",
            current=to_admin_user(user).model_dump(mode="json"),
        )
    if role is None or user.role == role:
        return user
    if user.role == "admin":
        await assert_not_last_admin(db, user.id)
    previous, user.role = user.role, role
    user.version += 1
    log.info("admin_role_changed", admin_id=str(admin.id), user_id=str(user.id), previous=previous, role=role)
    return user


@dataclass(frozen=True, slots=True)
class AdminActionResult:
    user: UserAccount
    delivery: Literal["email", "one_time_password"] | None = None
    one_time_password: str | None = None


async def admin_user_action(
    db: AsyncSession,
    mailer: Mailer,
    settings: Settings,
    admin: UserAccount,
    target_id: uuid.UUID,
    action: AdminAction,
) -> AdminActionResult:
    if action == "deactivate":
        await _lock_admin_changes(db, admin)
    user = await _target(db, admin, target_id)
    if action == "deactivate":
        if user.deactivated_at is None:
            if user.role == "admin":
                await assert_not_last_admin(db, user.id)
            user.deactivated_at = utcnow()
            user.version += 1
            await revoke_sessions(db, user.id)
            log.info("admin_user_deactivated", admin_id=str(admin.id), user_id=str(user.id))
    elif action == "reactivate":
        if user.deactivated_at is not None:
            user.deactivated_at = None
            user.version += 1
            log.info("admin_user_reactivated", admin_id=str(admin.id), user_id=str(user.id))
    elif action == "unlock":
        await admin_unlock(admin, user)
    else:
        reset = await admin_reset_password(db, mailer, settings, admin, user)
        return AdminActionResult(
            user=user, delivery=reset.delivery, one_time_password=reset.one_time_password
        )
    return AdminActionResult(user=user)


async def admin_list_invites(db: AsyncSession) -> list[AuthToken]:
    return list(
        (
            await db.scalars(
                select(AuthToken)
                .where(
                    AuthToken.purpose == "invite",
                    AuthToken.used_at.is_(None),
                    AuthToken.revoked_at.is_(None),
                    AuthToken.expires_at > utcnow(),
                )
                .order_by(AuthToken.created_at.desc(), AuthToken.id.desc())
            )
        ).all()
    )


@dataclass(frozen=True, slots=True)
class InviteResult:
    delivery: Literal["email", "one_time_password"]
    invite: AuthToken | None = None
    user: UserAccount | None = None
    one_time_password: str | None = None


async def admin_invite(
    db: AsyncSession,
    mailer: Mailer,
    settings: Settings,
    admin: UserAccount,
    *,
    email: str,
    role: str,
    display_name: str | None,
) -> InviteResult:
    email = email.strip()
    if await _find_user_by_email(db, email) is not None:
        raise ProblemError(409, ProblemCode.DUPLICATE, "An account with this e-mail already exists")
    now = utcnow()
    if not settings.smtp_host:
        one_time = secrets.token_urlsafe(15)
        user = UserAccount(
            email=email,
            password_hash=crypto.hash_password(one_time),
            display_name=(display_name or email.split("@", 1)[0]).strip()[:80] or "User",
            time_zone=admin.time_zone,
            role=role,
            email_verified_at=now,
            must_change_password=True,
        )
        db.add(user)
        try:
            await db.flush()
        except IntegrityError:
            raise ProblemError(
                409, ProblemCode.DUPLICATE, "An account with this e-mail already exists"
            ) from None
        await db.refresh(user)
        log.info(
            "admin_user_invited",
            admin_id=str(admin.id),
            user_id=str(user.id),
            role=role,
            delivery="one_time_password",
        )
        return InviteResult(delivery="one_time_password", user=user, one_time_password=one_time)

    revoked = await db.execute(
        update(AuthToken)
        .where(
            AuthToken.purpose == "invite",
            func.lower(AuthToken.email) == email.lower(),
            AuthToken.used_at.is_(None),
            AuthToken.revoked_at.is_(None),
        )
        .values(revoked_at=now)
    )
    token, record = await _new_invite(db, email, role, admin.id)
    await db.refresh(record)
    log.info(
        "admin_user_invited",
        admin_id=str(admin.id),
        invite_id=str(record.id),
        role=role,
        delivery="email",
        superseded=getattr(revoked, "rowcount", 0),
    )
    await mailer.send(
        email,
        "Haalendar: you are invited",
        f"Hello,\n\n{admin.display_name} invited you to Haalendar"
        f"{' as an administrator' if role == 'admin' else ''}.\n"
        f"Create your account here:\n{settings.public_url.rstrip('/')}/invite?token={token}\n\n"
        "The link is valid for 7 days and can be used once. If you did not expect this, ignore this message.\n",
    )
    return InviteResult(delivery="email", invite=record)


async def admin_revoke_invite(db: AsyncSession, admin: UserAccount, invite_id: uuid.UUID) -> None:
    invite = await db.scalar(
        select(AuthToken).where(
            AuthToken.id == invite_id,
            AuthToken.purpose == "invite",
            AuthToken.used_at.is_(None),
            AuthToken.revoked_at.is_(None),
        )
    )
    if invite is None:
        raise ProblemError(404, ProblemCode.NOT_FOUND, "Invitation not found")
    invite.revoked_at = utcnow()
    log.info("admin_invite_revoked", admin_id=str(admin.id), invite_id=str(invite.id))


# ---------------------------------------------------------------------------------------------------------------
# +++===+++ 2026-10-15 — Hasan Alizada — HAAL-166. Profile (FR-ACC-08): name, time zone, locale with optimistic
# concurrency (If-Match → version), avatar upload/removal. The avatar is re-encoded off the event loop and stored
# content-addressed; removing it only clears the reference (files are never deleted). avatar_url carries a content
# version, so browsers may cache it forever.
# ---------------------------------------------------------------------------------------------------------------

AVATAR_MEDIA_TYPE = "image/webp"


def avatar_url(user: UserAccount) -> str | None:
    if not user.avatar_key:
        return None
    version = user.avatar_key.rsplit("/", 1)[-1][:16]
    return f"/api/v1/users/{user.id}/avatar?v={version}"


def to_me(user: UserAccount, csrf_token: str | None = None) -> MeOut:
    return MeOut(
        id=user.id,
        email=user.email,
        display_name=user.display_name,
        avatar_url=avatar_url(user),
        role="admin" if user.role == "admin" else "user",
        time_zone=user.time_zone,
        locale="en",
        totp_enabled=user.totp_enabled_at is not None,
        must_change_password=user.must_change_password,
        csrf_token=csrf_token,
        version=user.version,
    )


async def update_profile(
    db: AsyncSession,
    user: UserAccount,
    *,
    expected_version: int,
    display_name: str | None,
    time_zone: str | None,
) -> UserAccount:
    if user.version != expected_version:
        raise ProblemError(
            412,
            ProblemCode.VERSION_CONFLICT,
            "The profile was changed meanwhile",
            current=to_me(user).model_dump(mode="json"),
        )
    changed: list[str] = []
    if display_name is not None:
        name = display_name.strip()
        if not name:
            raise ProblemError(
                422,
                ProblemCode.VALIDATION_FAILED,
                "Invalid profile",
                errors=[{"pointer": "/display_name", "detail": "Enter a name"}],
            )
        if name != user.display_name:
            user.display_name = name
            changed.append("display_name")
    if time_zone is not None and time_zone != user.time_zone:
        if time_zone not in _time_zones():
            raise ProblemError(
                422,
                ProblemCode.VALIDATION_FAILED,
                "Unknown time zone",
                errors=[{"pointer": "/time_zone", "detail": "Use an IANA time zone, e.g. Europe/Berlin"}],
            )
        user.time_zone = time_zone
        changed.append("time_zone")
    if changed:
        user.version += 1
        log.info("profile_updated", user_id=str(user.id), fields=changed)
    return user


async def set_avatar(db: AsyncSession, storage: Storage, user: UserAccount, data: bytes) -> UserAccount:
    processed = await asyncio.to_thread(process_avatar, data)
    stored = await asyncio.to_thread(storage.put, user.id, processed, AVATAR_MEDIA_TYPE)
    if stored.key != user.avatar_key:
        user.avatar_key = stored.key
        user.version += 1
    log.info("avatar_set", user_id=str(user.id), size_bytes=stored.size_bytes)
    return user


async def remove_avatar(db: AsyncSession, user: UserAccount) -> UserAccount:
    if user.avatar_key is not None:
        user.avatar_key = None  # the stored file stays (never deleted)
        user.version += 1
        log.info("avatar_removed", user_id=str(user.id))
    return user


async def avatar_bytes(db: AsyncSession, storage: Storage, user_id: uuid.UUID) -> bytes | None:
    """Avatar of an active user, or None (unknown, deactivated, no avatar or file missing)."""
    user = await db.get(UserAccount, user_id)
    if user is None or user.deactivated_at is not None or not user.avatar_key:
        return None
    data = await asyncio.to_thread(storage.get, user.avatar_key)
    if data is None:
        log.error("avatar_file_missing", user_id=str(user.id))
    return data


# ---------------------------------------------------------------------------------------------------------------
# +++===+++ 2026-10-15 — Hasan Alizada — HAAL-171. Remaining self-service: resend the verification link (generic
# outcome, throttled per account), replace recovery codes, list/revoke own sessions; instance settings for admins
# (registration mode, admin 2FA policy) with If-Match. Enabling the admin 2FA policy is refused while the acting admin
# has no 2FA (no self lock-out).
# ---------------------------------------------------------------------------------------------------------------

VERIFY_RESEND_INTERVAL = timedelta(minutes=5)


async def resend_verification(db: AsyncSession, mailer: Mailer, settings: Settings, email: str) -> None:
    """Send a new verification link to an existing, active, unverified account; silently nothing otherwise."""
    user = await _find_user_by_email(db, email)
    if user is None or user.deactivated_at is not None or user.email_verified_at is not None:
        log.info("verify_resend_ignored")
        return
    recent = await db.scalar(
        select(AuthToken.id)
        .where(
            AuthToken.user_id == user.id,
            AuthToken.purpose == "email_verify",
            AuthToken.created_at > utcnow() - VERIFY_RESEND_INTERVAL,
        )
        .limit(1)
    )
    if recent is not None:
        log.info("verify_resend_throttled", user_id=str(user.id))
        return
    await _send_verification(db, mailer, settings, user)
    log.info("verify_resend_sent", user_id=str(user.id))


async def regenerate_recovery_codes(db: AsyncSession, session: AuthSession, user: UserAccount) -> list[str]:
    require_recent_reauth(session)
    if user.totp_enabled_at is None:
        raise ProblemError(409, ProblemCode.INVALID_STATE, "Two-factor authentication is not enabled")
    codes = await _replace_recovery_codes(db, user.id)
    log.info("recovery_codes_regenerated", user_id=str(user.id))
    return codes


async def list_sessions(db: AsyncSession, user_id: uuid.UUID) -> list[AuthSession]:
    now = utcnow()
    return list(
        (
            await db.scalars(
                select(AuthSession)
                .where(
                    AuthSession.user_id == user_id,
                    AuthSession.revoked_at.is_(None),
                    AuthSession.idle_expires_at > now,
                    AuthSession.absolute_expires_at > now,
                )
                .order_by(AuthSession.last_seen_at.desc())
            )
        ).all()
    )


async def revoke_own_session(db: AsyncSession, user_id: uuid.UUID, session_id: uuid.UUID) -> None:
    session = await db.scalar(
        select(AuthSession).where(
            AuthSession.id == session_id, AuthSession.user_id == user_id, AuthSession.revoked_at.is_(None)
        )
    )
    if session is None:
        raise ProblemError(404, ProblemCode.NOT_FOUND, "Session not found")
    session.revoked_at = utcnow()
    log.info("session_revoked", user_id=str(user_id), session_id=str(session_id))


def device_summary(user_agent: str | None) -> str:
    """Short, human-readable device description from the stored user agent (never shown raw)."""
    ua = (user_agent or "").lower()
    browser = next(
        (name for key, name in (("edg/", "Edge"), ("firefox/", "Firefox"), ("chrome/", "Chrome"), ("safari/", "Safari"))
         if key in ua),
        "Browser",
    )  # fmt: skip
    system = next(
        (name for key, name in (("android", "Android"), ("iphone", "iOS"), ("ipad", "iPadOS"), ("windows", "Windows"),
                                ("mac os", "macOS"), ("linux", "Linux")) if key in ua),
        "",
    )  # fmt: skip
    return f"{browser} on {system}" if system else browser


async def get_instance_settings(db: AsyncSession) -> InstanceSettings:
    row = await db.get(InstanceSettings, 1)
    if row is None:
        raise ProblemError(500, ProblemCode.INTERNAL_ERROR, "Instance settings are missing")
    return row


async def update_instance_settings(
    db: AsyncSession,
    admin: UserAccount,
    *,
    expected_version: int,
    registration_mode: str | None,
    require_admin_2fa: bool | None,
) -> InstanceSettings:
    row = await db.get(InstanceSettings, 1, with_for_update=True, populate_existing=True)
    if row is None:
        raise ProblemError(500, ProblemCode.INTERNAL_ERROR, "Instance settings are missing")
    if row.version != expected_version:
        raise ProblemError(
            412,
            ProblemCode.VERSION_CONFLICT,
            "The settings were changed meanwhile",
            current={"registration_mode": row.registration_mode, "require_admin_2fa": row.require_admin_2fa,
                     "version": row.version},
        )  # fmt: skip
    changed: list[str] = []
    if registration_mode is not None and registration_mode != row.registration_mode:
        row.registration_mode = registration_mode
        changed.append("registration_mode")
    if require_admin_2fa is not None and require_admin_2fa != row.require_admin_2fa:
        if require_admin_2fa and admin.totp_enabled_at is None:
            raise ProblemError(
                409, ProblemCode.INVALID_STATE, "Enable two-factor authentication for yourself first"
            )
        row.require_admin_2fa = require_admin_2fa
        changed.append("require_admin_2fa")
    if changed:
        row.version += 1
        row.updated_by = admin.id
        log.info("instance_settings_changed", admin_id=str(admin.id), fields=changed)
    return row
