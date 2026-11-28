"""Due date of a note (FR-TODO-01, FR-TODO-06, owner decision D-121).

+++===+++ 2026-11-23 17:40 +04 — Hasan Alizada — HAAL-104. Forward-only.
- `note.due_date` (date) and `note.due_time` (time, needs the date): as a card's due date (D-92) — wall-clock in the
  zone of the note's owner, a date alone meaning the whole day.
- `note.due_at` (timestamptz, planned in 0022) was never written by any path; it goes. A value found in it all the same
  is kept: moved to the date and time it shows in the owner's zone.

Revision ID: 0035
Revises: 0034
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0035"
down_revision: str | None = "0034"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("note", sa.Column("due_date", sa.Date()))
    op.add_column("note", sa.Column("due_time", sa.Time()))
    op.execute(
        """
        UPDATE note n
           SET due_date = (n.due_at AT TIME ZONE coalesce(u.time_zone, 'UTC'))::date,
               due_time = date_trunc('minute', (n.due_at AT TIME ZONE coalesce(u.time_zone, 'UTC')))::time
          FROM item i
          LEFT JOIN user_account u ON u.id = i.owner_id
         WHERE i.id = n.id AND n.due_at IS NOT NULL
        """
    )
    op.drop_column("note", "due_at")
    op.create_check_constraint(
        "ck_note_due_time_needs_date", "note", "due_time IS NULL OR due_date IS NOT NULL"
    )


def downgrade() -> None:
    raise NotImplementedError("Migrations are forward-only (SRS 4.5); restore from backup to roll back.")
