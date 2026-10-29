"""Reminders on notes (FR-TODO-07, owner decision D-89).

+++===+++ 2026-10-29 — Hasan Alizada — HAAL-105. Forward-only.
- `reminder.remind_at`: the third form of a reminder — a date and time, fired once (notes; an event keeps the two
  forms "before" and "on the day"). Exactly one of the three forms (the CHECK of migration 0017 is replaced).

Revision ID: 0024
Revises: 0023
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0024"
down_revision: str | None = "0023"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("reminder", sa.Column("remind_at", sa.DateTime(timezone=True)))
    # As in migration 0019: alembic names the constraint the same way migration 0017 created it.
    op.drop_constraint("ck_reminder_one_form", "reminder", type_="check")
    op.create_check_constraint(
        "ck_reminder_one_form",
        "reminder",
        "(offset_minutes IS NOT NULL AND all_day_time IS NULL AND all_day_days_before IS NULL AND remind_at IS NULL)"
        " OR (offset_minutes IS NULL AND all_day_time IS NOT NULL AND all_day_days_before IS NOT NULL"
        " AND remind_at IS NULL)"
        " OR (offset_minutes IS NULL AND all_day_time IS NULL AND all_day_days_before IS NULL"
        " AND remind_at IS NOT NULL)",
    )


def downgrade() -> None:
    raise NotImplementedError("Migrations are forward-only (SRS 4.5); restore from backup to roll back.")
