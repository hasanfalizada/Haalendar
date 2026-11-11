"""Reminders on cards (FR-KAN-07, owner decision D-94).

+++===+++ 2026-10-30 — Hasan Alizada — HAAL-116. Forward-only.
- A card takes the two forms of an event's reminder ("before" its due time, "on the day" of its due date); the table
  `reminder` is unchanged.
- The function that marks reminders "to check" also handles boards and columns (archived or unarchived: the reminders
  of their cards) and is called on updates of `board`, `board_column` and `card` (due date and time, column).

Revision ID: 0028
Revises: 0027
"""

from collections.abc import Sequence

from alembic import op

from haalendar.planning.reminder_sql import RECHECK_ITEM_FUNCTION_0028, RECHECK_TRIGGERS_0028

revision: str = "0028"
down_revision: str | None = "0027"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    for statement in (RECHECK_ITEM_FUNCTION_0028, *RECHECK_TRIGGERS_0028):
        op.execute(statement)


def downgrade() -> None:
    raise NotImplementedError("Migrations are forward-only (SRS 4.5); restore from backup to roll back.")
