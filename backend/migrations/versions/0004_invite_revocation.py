"""Invitation revocation: auth_token.revoked_at (a revoked invitation is kept, never deleted).

+++===+++ 2026-10-15 — Hasan Alizada — HAAL-164. Forward-only.

Revision ID: 0004
Revises: 0003
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0004"
down_revision: str | None = "0003"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("auth_token", sa.Column("revoked_at", sa.DateTime(timezone=True)))


def downgrade() -> None:
    raise NotImplementedError("Migrations are forward-only (SRS 4.5); restore from backup to roll back.")
