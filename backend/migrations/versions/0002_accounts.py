"""Accounts: user_account, session, auth_token, instance_settings.

+++===+++ 2026-10-15 — Hasan Alizada — HAAL-160. Forward-only. instance_settings gets its single row with
registration_mode = 'invite' (invite-only by default, D-16).

Revision ID: 0002
Revises: 0001
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0002"
down_revision: str | None = "0001"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

TZ = sa.DateTime(timezone=True)


def upgrade() -> None:
    op.create_table(
        "user_account",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("email", sa.String(254), nullable=False),
        sa.Column("email_verified_at", TZ),
        sa.Column("password_hash", sa.Text(), nullable=False),
        sa.Column("display_name", sa.String(80), nullable=False),
        sa.Column("avatar_key", sa.Text()),
        sa.Column("time_zone", sa.String(64), nullable=False),
        sa.Column("locale", sa.String(10), nullable=False, server_default="en"),
        sa.Column("role", sa.String(10), nullable=False, server_default="user"),
        sa.Column("totp_secret_enc", sa.Text()),
        sa.Column("totp_enabled_at", TZ),
        sa.Column("failed_login_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("locked_until", TZ),
        sa.Column("last_login_at", TZ),
        sa.Column("must_change_password", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("deactivated_at", TZ),
        sa.Column("created_at", TZ, nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", TZ, nullable=False, server_default=sa.func.now()),
        sa.Column("version", sa.Integer(), nullable=False, server_default="1"),
        sa.CheckConstraint("role in ('admin', 'user')", name="ck_user_account_role_valid"),
    )
    op.create_index("uq_user_account_email_lower", "user_account", [sa.text("lower(email)")], unique=True)

    op.create_table(
        "session",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("token_hash", sa.String(64), nullable=False, unique=True),
        sa.Column("user_id", sa.Uuid(), sa.ForeignKey("user_account.id"), nullable=False),
        sa.Column("created_at", TZ, nullable=False, server_default=sa.func.now()),
        sa.Column("last_seen_at", TZ, nullable=False),
        sa.Column("idle_expires_at", TZ, nullable=False),
        sa.Column("absolute_expires_at", TZ, nullable=False),
        sa.Column("revoked_at", TZ),
        sa.Column("user_agent", sa.String(200)),
        sa.Column("ip_prefix", sa.String(64)),
        sa.Column("csrf_secret", sa.String(64), nullable=False),
        sa.Column("reauth_at", TZ),
    )
    op.create_index("ix_session_user_id", "session", ["user_id"])

    op.create_table(
        "auth_token",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("user_id", sa.Uuid(), sa.ForeignKey("user_account.id")),
        sa.Column("email", sa.String(254), nullable=False),
        sa.Column("purpose", sa.String(20), nullable=False),
        sa.Column("role", sa.String(10)),
        sa.Column("token_hash", sa.String(64), nullable=False, unique=True),
        sa.Column("expires_at", TZ, nullable=False),
        sa.Column("used_at", TZ),
        sa.Column("created_by", sa.Uuid(), sa.ForeignKey("user_account.id")),
        sa.Column("created_at", TZ, nullable=False, server_default=sa.func.now()),
        sa.CheckConstraint(
            "purpose in ('email_verify', 'password_reset', 'invite')", name="ck_auth_token_purpose_valid"
        ),
    )
    op.create_index("ix_auth_token_user_id", "auth_token", ["user_id"])

    op.create_table(
        "instance_settings",
        sa.Column("id", sa.SmallInteger(), primary_key=True),
        sa.Column("registration_mode", sa.String(10), nullable=False, server_default="invite"),
        sa.Column("require_admin_2fa", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("updated_at", TZ, nullable=False, server_default=sa.func.now()),
        sa.Column("updated_by", sa.Uuid(), sa.ForeignKey("user_account.id")),
        sa.Column("version", sa.Integer(), nullable=False, server_default="1"),
        sa.CheckConstraint("id = 1", name="ck_instance_settings_single_row"),
        sa.CheckConstraint(
            "registration_mode in ('invite', 'open')", name="ck_instance_settings_registration_mode_valid"
        ),
    )
    op.execute("INSERT INTO instance_settings (id) VALUES (1)")


def downgrade() -> None:
    raise NotImplementedError("Migrations are forward-only (SRS 4.5); restore from backup to roll back.")
