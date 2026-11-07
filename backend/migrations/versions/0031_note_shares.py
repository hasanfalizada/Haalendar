"""Shared notes (FR-ACC-10, owner decision D-30).

+++===+++ 2026-11-07 — Hasan Alizada — HAAL-145 (UAT finding F7). Forward-only. Notes could already be shared at the
level of row-level security and access (a note is its own container, D-87); the share notification now names a shared
note by its title, like a calendar or a board by its name.

Revision ID: 0031
Revises: 0030
"""

from collections.abc import Sequence

from alembic import op

from haalendar.notifications.sql import NOTIFY_SHARE_FUNCTION_0031

revision: str = "0031"
down_revision: str | None = "0030"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.execute(NOTIFY_SHARE_FUNCTION_0031)


def downgrade() -> None:
    raise NotImplementedError("Migrations are forward-only (SRS 4.5); restore from backup to roll back.")
