"""Order of the events of a day: by time or by colour (FR-CAL-01, F-14, owner decision D-111).

+++===+++ 2026-11-18 16:37 +04 — Hasan Alizada — HAAL-185. Forward-only.
- `user_settings.day_order`: how the calendar views order the events of one day, `time` (the default, as before) or
  `color` (the legacy order: the colour's name, then title — atom calendar.day_order.v2); one choice for every device
  of the user, synced with the settings row.

Revision ID: 0034
Revises: 0033
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0034"
down_revision: str | None = "0033"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "user_settings",
        sa.Column("day_order", sa.String(5), nullable=False, server_default="time"),
    )
    op.create_check_constraint("day_order_known", "user_settings", "day_order IN ('time', 'color')")


def downgrade() -> None:
    raise NotImplementedError("Migrations are forward-only (SRS 4.5); restore from backup to roll back.")
