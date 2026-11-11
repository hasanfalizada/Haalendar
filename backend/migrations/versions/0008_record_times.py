"""Record timestamps: updated_at maintained and created_at immutable on every existing table (FR-X-02).

+++===+++ 2026-10-16 — Hasan Alizada — HAAL-031. Forward-only. Later tables add the triggers themselves
(haalendar.record_times.record_time_triggers).

Revision ID: 0008
Revises: 0007
"""

from collections.abc import Sequence

from alembic import op

from haalendar.record_times import KEEP_CREATED_AT_FUNCTION, TOUCH_UPDATED_AT_FUNCTION, record_time_triggers

revision: str = "0008"
down_revision: str | None = "0007"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

# table: (has created_at, has updated_at)
TABLES = {
    "user_account": (True, True),
    "session": (True, False),
    "auth_token": (True, False),
    "instance_settings": (False, True),
    "recovery_code": (True, False),
    "calendar": (True, True),
    "share": (True, True),
}


def upgrade() -> None:
    op.execute(TOUCH_UPDATED_AT_FUNCTION)
    op.execute(KEEP_CREATED_AT_FUNCTION)
    for table, (created_at, updated_at) in TABLES.items():
        for statement in record_time_triggers(table, created_at=created_at, updated_at=updated_at):
            op.execute(statement)


def downgrade() -> None:
    raise NotImplementedError("Migrations are forward-only (SRS 4.5); restore from backup to roll back.")
