"""Live updates (FR-OFF-03, ADR-0009, owner decision D-59).

+++===+++ 2026-10-22 — Hasan Alizada — HAAL-055. Forward-only.
- `haalendar_sync_notify()` and an AFTER INSERT/UPDATE trigger on the synced tables and `notification`: on commit,
  PostgreSQL tells every API process listening on `haalendar_sync` whom a change concerns (no data).
- `haalendar_sync_audience(kind, id)`: owner and current grantees of a container (user ids only).

Revision ID: 0015
Revises: 0014
"""

from collections.abc import Sequence

from alembic import op

from haalendar.live.sql import NOTIFIED_TABLES, NOTIFY_FUNCTION, audience_function, notify_trigger

revision: str = "0015"
down_revision: str | None = "0014"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.execute(NOTIFY_FUNCTION)
    for table in NOTIFIED_TABLES:
        op.execute(notify_trigger(table))
    op.execute(audience_function({"calendar": "calendar"}))


def downgrade() -> None:
    raise NotImplementedError("Migrations are forward-only (SRS 4.5); restore from backup to roll back.")
