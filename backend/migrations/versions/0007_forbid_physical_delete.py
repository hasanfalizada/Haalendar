"""Soft delete everywhere: triggers that forbid DELETE and TRUNCATE on every existing table (FR-X-01).

+++===+++ 2026-10-16 — Hasan Alizada — HAAL-030. Forward-only. Tables created by later migrations add the same
triggers themselves (haalendar.security.no_delete.forbid_delete_triggers).

Revision ID: 0007
Revises: 0006
"""

from collections.abc import Sequence

from alembic import op

from haalendar.security.no_delete import FORBID_DELETE_FUNCTION, forbid_delete_triggers

revision: str = "0007"
down_revision: str | None = "0006"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

TABLES = ("user_account", "session", "auth_token", "instance_settings", "recovery_code", "calendar", "share")


def upgrade() -> None:
    op.execute(FORBID_DELETE_FUNCTION)
    for table in TABLES:
        for statement in forbid_delete_triggers(table):
            op.execute(statement)


def downgrade() -> None:
    raise NotImplementedError("Migrations are forward-only (SRS 4.5); restore from backup to roll back.")
