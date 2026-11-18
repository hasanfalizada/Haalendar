"""Grid or list of notes (FR-TODO-05, owner decision D-110).

+++===+++ 2026-11-18 14:33 +04 — Hasan Alizada — HAAL-103. Forward-only.
- `user_settings.note_layout`: how the To-Do page lays out the notes, `grid` (the default, as before) or `list`; one
  choice for every device of the user, synced with the settings row.

Revision ID: 0033
Revises: 0032
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0033"
down_revision: str | None = "0032"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "user_settings",
        sa.Column("note_layout", sa.String(4), nullable=False, server_default="grid"),
    )
    op.create_check_constraint("note_layout_known", "user_settings", "note_layout IN ('grid', 'list')")


def downgrade() -> None:
    raise NotImplementedError("Migrations are forward-only (SRS 4.5); restore from backup to roll back.")
