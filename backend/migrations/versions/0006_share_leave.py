"""Sharing: grantees may leave a shared container (revoke their own share).

+++===+++ 2026-10-15 — Hasan Alizada — HAAL-167. Forward-only.

Revision ID: 0006
Revises: 0005
"""

from collections.abc import Sequence

from alembic import op

from haalendar.security.rls import share_leave_policy

revision: str = "0006"
down_revision: str | None = "0005"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    for statement in share_leave_policy():
        op.execute(statement)


def downgrade() -> None:
    raise NotImplementedError("Migrations are forward-only (SRS 4.5); restore from backup to roll back.")
