"""ICS import and export (FR-CAL-33, C-09, owner decision D-83).

+++===+++ 2026-10-29 — Hasan Alizada — HAAL-095. Forward-only. `event.ics_uid`: the UID of an event imported from an
.ics file (at most 255 characters), so importing the same file into the same calendar again skips what is already
there; looked up per calendar among events that carry one.

Revision ID: 0021
Revises: 0020
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0021"
down_revision: str | None = "0020"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("event", sa.Column("ics_uid", sa.String(255), nullable=True))
    op.create_index(
        "ix_event_container_ics_uid",
        "event",
        ["container_id", "ics_uid"],
        postgresql_where=sa.text("ics_uid IS NOT NULL"),
    )


def downgrade() -> None:
    raise NotImplementedError("Migrations are forward-only (SRS 4.5); restore from backup to roll back.")
