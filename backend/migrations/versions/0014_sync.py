"""Offline sync on the server (FR-OFF-02..04, ADR-0009, owner decision D-56).

+++===+++ 2026-10-21 — Hasan Alizada — HAAL-053. Forward-only.
- One global sequence `sync_seq_global`. A BEFORE INSERT/UPDATE trigger on every syncable table stamps `sync_seq`
  (next number) and `sync_xid` (the writing transaction), so a pull can hand out changes in order and never skip a
  transaction that commits late (cursor = last number + transactions still in progress). A SECURITY DEFINER function
  gives the highest committed number over all tables (a number only), so a cursor moves past rows the user cannot see.
- Existing rows get numbers here with the table's triggers switched off for that one statement (table owner's
  right, no superuser needed): no audit entries, no new versions or update times for a pure renumbering.
- The audit function is re-created so `sync_xid` counts as bookkeeping (no audit entry for a mere renumbering).
- sync_mutation: one row per applied offline mutation (exactly once); owner-only row-level security; never deleted;
  service data, not audited.

Revision ID: 0014
Revises: 0013
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import JSONB

from haalendar.audit.sql import AUDIT_FUNCTION
from haalendar.security.no_delete import forbid_delete_triggers
from haalendar.security.rls import self_policies
from haalendar.sync.sql import (
    SYNC_HIGH_WATER_FUNCTION,
    SYNC_STAMP_FUNCTION,
    SYNCED_TABLES,
    sync_stamp_trigger,
)

revision: str = "0014"
down_revision: str | None = "0013"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

TZ = sa.DateTime(timezone=True)


def upgrade() -> None:
    op.execute("CREATE SEQUENCE sync_seq_global AS bigint")
    op.execute(AUDIT_FUNCTION)  # NOISE_COLUMNS now include sync_xid
    op.execute(SYNC_STAMP_FUNCTION)
    for table in SYNCED_TABLES:
        op.execute(f"ALTER TABLE {table} ADD COLUMN sync_xid xid8")
        op.execute(sync_stamp_trigger(table))
        op.execute(f"CREATE INDEX ix_{table}_sync_seq ON {table} (sync_seq)")

    # Number the existing rows without firing the audit and record-time triggers (a renumbering is no change).
    for table in SYNCED_TABLES:
        op.execute(f"ALTER TABLE {table} DISABLE TRIGGER USER")
        op.execute(
            f"UPDATE {table} SET sync_seq = nextval('sync_seq_global'), sync_xid = pg_current_xact_id()"  # noqa: S608 — constant table names
        )
        op.execute(f"ALTER TABLE {table} ENABLE TRIGGER USER")
    op.execute(SYNC_HIGH_WATER_FUNCTION)

    op.create_table(
        "sync_mutation",
        sa.Column("mutation_id", sa.Uuid(), primary_key=True),
        sa.Column("owner_id", sa.Uuid(), sa.ForeignKey("user_account.id"), nullable=False),
        sa.Column("applied_at", TZ, nullable=False, server_default=sa.func.now()),
        sa.Column("status", sa.String(10), nullable=False),
        sa.Column("result", JSONB(), nullable=False),
        sa.CheckConstraint(
            "status in ('applied', 'conflict', 'rejected')", name="ck_sync_mutation_status_valid"
        ),
    )
    for statement in (*self_policies("sync_mutation"), *forbid_delete_triggers("sync_mutation")):
        op.execute(statement)


def downgrade() -> None:
    raise NotImplementedError("Migrations are forward-only (SRS 4.5); restore from backup to roll back.")
