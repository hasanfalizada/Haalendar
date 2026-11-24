"""Layers of the calendar: due dates of notes and of cards (FR-CAL-24, FR-TODO-06, owner decision D-122).

+++===+++ 2026-11-23 22:58 +04 — Hasan Alizada — HAAL-121. Forward-only.
- `user_settings.hidden_layers`: the layers this user hides in the calendar views, `note_due` and `card_due`;
  empty by default, so both are shown. One choice for every device of the user, synced with the settings row, as the
  hidden calendars (D-82).

Revision ID: 0036
Revises: 0035
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0036"
down_revision: str | None = "0035"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "user_settings",
        sa.Column("hidden_layers", postgresql.ARRAY(sa.String(8)), nullable=False, server_default="{}"),
    )
    op.create_check_constraint(
        "hidden_layers_known", "user_settings", "hidden_layers <@ ARRAY['note_due', 'card_due']::varchar[]"
    )


def downgrade() -> None:
    raise NotImplementedError("Migrations are forward-only (SRS 4.5); restore from backup to roll back.")
