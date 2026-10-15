"""Persistence models for accounts (domain model v1.0 section 6).

+++===+++ 2026-10-15 — Hasan Alizada — HAAL-160. Table `user_account` (not `user`: reserved word in PostgreSQL).
Security records are never deleted: sessions get `revoked_at`, tokens get `used_at` (domain model P10). Secrets are
stored only as hashes (session and e-mail tokens: SHA-256; passwords: Argon2id).
"""

from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import (
    BigInteger,
    CheckConstraint,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    SmallInteger,
    String,
    Text,
    func,
    text,
)
from sqlalchemy.orm import Mapped, mapped_column

from haalendar.models import Base


def _uuid7() -> uuid.UUID:
    return uuid.uuid7()


class UserAccount(Base):
    __tablename__ = "user_account"
    __table_args__ = (
        Index("uq_user_account_email_lower", text("lower(email)"), unique=True),
        CheckConstraint("role in ('admin', 'user')", name="role_valid"),
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=_uuid7)
    email: Mapped[str] = mapped_column(String(254))
    email_verified_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    password_hash: Mapped[str] = mapped_column(Text)
    display_name: Mapped[str] = mapped_column(String(80))
    avatar_key: Mapped[str | None] = mapped_column(Text)
    time_zone: Mapped[str] = mapped_column(String(64))
    locale: Mapped[str] = mapped_column(String(10), default="en", server_default="en")
    role: Mapped[str] = mapped_column(String(10), default="user", server_default="user")
    totp_secret_enc: Mapped[str | None] = mapped_column(Text)
    totp_enabled_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    # +++===+++ 2026-10-15 — Hasan Alizada — HAAL-162. Secret awaiting confirmation during enrolment; last accepted TOTP
    # time step (replay protection: a code cannot be used twice).
    totp_pending_secret_enc: Mapped[str | None] = mapped_column(Text)
    totp_last_step: Mapped[int | None] = mapped_column(BigInteger)
    failed_login_count: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    locked_until: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    last_login_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    must_change_password: Mapped[bool] = mapped_column(default=False, server_default="false")
    deactivated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )
    version: Mapped[int] = mapped_column(Integer, default=1, server_default="1")


class AuthSession(Base):
    __tablename__ = "session"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=_uuid7)
    token_hash: Mapped[str] = mapped_column(String(64), unique=True)
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("user_account.id"), index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    last_seen_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    idle_expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    absolute_expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    user_agent: Mapped[str | None] = mapped_column(String(200))
    ip_prefix: Mapped[str | None] = mapped_column(String(64))
    csrf_secret: Mapped[str] = mapped_column(String(64))
    reauth_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class AuthToken(Base):
    """Single-use e-mail tokens: verification (24 h), password reset (1 h), invitation."""

    __tablename__ = "auth_token"
    __table_args__ = (
        CheckConstraint("purpose in ('email_verify', 'password_reset', 'invite')", name="purpose_valid"),
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=_uuid7)
    user_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("user_account.id"), index=True)
    email: Mapped[str] = mapped_column(String(254))
    purpose: Mapped[str] = mapped_column(String(20))
    role: Mapped[str | None] = mapped_column(String(10))
    token_hash: Mapped[str] = mapped_column(String(64), unique=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    used_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    # +++===+++ 2026-10-15 — Hasan Alizada — HAAL-164. Set when an admin revokes an invitation or re-invites.
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_by: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("user_account.id"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class InstanceSettings(Base):
    """Single row (id = 1) with instance-wide settings."""

    __tablename__ = "instance_settings"
    __table_args__ = (
        CheckConstraint("id = 1", name="single_row"),
        CheckConstraint("registration_mode in ('invite', 'open')", name="registration_mode_valid"),
    )

    id: Mapped[int] = mapped_column(SmallInteger, primary_key=True, default=1)
    registration_mode: Mapped[str] = mapped_column(String(10), default="invite", server_default="invite")
    require_admin_2fa: Mapped[bool] = mapped_column(default=False, server_default="false")
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )
    updated_by: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("user_account.id"))
    version: Mapped[int] = mapped_column(Integer, default=1, server_default="1")


class RecoveryCode(Base):
    """+++===+++ 2026-10-15 — Hasan Alizada — HAAL-162. Single-use 2FA recovery codes, stored as SHA-256 hashes."""

    __tablename__ = "recovery_code"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=_uuid7)
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("user_account.id"), index=True)
    code_hash: Mapped[str] = mapped_column(String(64))
    used_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
