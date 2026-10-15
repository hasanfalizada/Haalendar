"""Login protection: TOTP enrolment columns and recovery codes.

+++===+++ 2026-10-15 — Hasan Alizada — HAAL-162. Forward-only.

Revision ID: 0003
Revises: 0002
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0003"
down_revision: str | None = "0002"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("user_account", sa.Column("totp_pending_secret_enc", sa.Text()))
    op.add_column("user_account", sa.Column("totp_last_step", sa.BigInteger()))
    op.create_table(
        "recovery_code",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("user_id", sa.Uuid(), sa.ForeignKey("user_account.id"), nullable=False),
        sa.Column("code_hash", sa.String(64), nullable=False),
        sa.Column("used_at", sa.DateTime(timezone=True)),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )
    op.create_index("ix_recovery_code_user_id", "recovery_code", ["user_id"])


def downgrade() -> None:
    raise NotImplementedError("Migrations are forward-only (SRS 4.5); restore from backup to roll back.")
