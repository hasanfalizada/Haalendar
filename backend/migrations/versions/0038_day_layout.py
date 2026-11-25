"""The day view as a list or as hours (FR-CAL-01, FR-CAL-25, owner decision D-124).

+++===+++ 2026-11-25 11:40 +04 — Hasan Alizada — HAAL-195. Forward-only.
- `user_settings.day_layout`: how the calendar's day view shows the events of the day, `list` (the default, the legacy
  day list as before) or `hours` (the week's grid of hours for one day, with the current-time line); one choice for
  every device of the user, synced with the settings row.

Revision ID: 0038
Revises: 0037
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0038"
down_revision: str | None = "0037"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "user_settings",
        sa.Column("day_layout", sa.String(5), nullable=False, server_default="list"),
    )
    op.create_check_constraint("day_layout_known", "user_settings", "day_layout IN ('list', 'hours')")


def downgrade() -> None:
    raise NotImplementedError("Migrations are forward-only (SRS 4.5); restore from backup to roll back.")
