"""Multiple calendars (FR-CAL-32, C-08, owner decision D-82).

+++===+++ 2026-10-29 — Hasan Alizada — HAAL-094 (stage 1). Forward-only.
- Every user has exactly one active default calendar: users without one get it here — their oldest active calendar
  that is not archived, or a new "My calendar" (blue) when they have none; new users get it when they are created.
- A default calendar cannot be archived (CHECK; deleting it is refused by the application).
- `user_settings.hidden_calendars`: the calendars this user hides in the calendar views (personal, also shared ones).
- Archiving or unarchiving a calendar marks the reminders of its events "to check" (archived: they do not fire).

Revision ID: 0020
Revises: 0019
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import ARRAY, UUID

from haalendar.planning.reminder_sql import RECHECK_CALENDAR_TRIGGER, RECHECK_ITEM_FUNCTION_0020

revision: str = "0020"
down_revision: str | None = "0019"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

DEFAULT_NAME = "My calendar"


def upgrade() -> None:
    op.execute(
        """
        UPDATE calendar c SET is_default = true, version = c.version + 1
        FROM (
          SELECT DISTINCT ON (owner_id) id FROM calendar
          WHERE deleted_at IS NULL AND archived_at IS NULL
            AND owner_id NOT IN (SELECT owner_id FROM calendar WHERE is_default AND deleted_at IS NULL)
          ORDER BY owner_id, created_at, id
        ) oldest
        WHERE c.id = oldest.id
        """
    )
    op.execute(
        sa.text(
            """
            INSERT INTO calendar (id, owner_id, name, color, is_default, created_by, updated_by)
            SELECT uuidv7(), u.id, :name, 'blue', true, u.id, u.id FROM user_account u
            WHERE NOT EXISTS (SELECT 1 FROM calendar c WHERE c.owner_id = u.id AND c.is_default AND c.deleted_at IS NULL)
            """
        ).bindparams(name=DEFAULT_NAME)
    )
    op.create_check_constraint(
        "default_not_archived", "calendar", "NOT (is_default AND archived_at IS NOT NULL)"
    )
    op.add_column(
        "user_settings",
        sa.Column("hidden_calendars", ARRAY(UUID(as_uuid=True)), nullable=False, server_default="{}"),
    )
    op.execute(RECHECK_ITEM_FUNCTION_0020)
    op.execute(RECHECK_CALENDAR_TRIGGER)


def downgrade() -> None:
    raise NotImplementedError("Migrations are forward-only (SRS 4.5); restore from backup to roll back.")
