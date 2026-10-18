"""Background job queue (Procrastinate) and data export requests (FR-X-14, owner decision D-48).

+++===+++ 2026-10-18 — Hasan Alizada — HAAL-043. Forward-only.
- The Procrastinate schema is applied from the pinned package (procrastinate 3.10.0). Its SQL contains DELETE inside
  library functions, so it runs on the raw driver connection, past the application's soft-delete SQL guard. All its
  tables except the worker registry get the no-delete triggers (haalendar.security.no_delete.SERVICE_TABLES).
- export_request: one row per requested export, kept for good (the archive file itself expires after 7 days);
  owner-only row-level security.

Revision ID: 0011
Revises: 0010
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from procrastinate.schema import SchemaManager
from sqlalchemy.util import await_

from haalendar.record_times import record_time_triggers
from haalendar.security.no_delete import forbid_delete_triggers
from haalendar.security.rls import self_policies

revision: str = "0011"
down_revision: str | None = "0010"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

TZ = sa.DateTime(timezone=True)
QUEUE_TABLES_WITHOUT_DELETE = ("procrastinate_jobs", "procrastinate_events", "procrastinate_periodic_defers")


def upgrade() -> None:
    # Migrations run on the async psycopg driver: the raw connection's execute() is awaited from the sync migration code.
    driver = op.get_bind().connection.driver_connection
    assert driver is not None
    await_(driver.execute(SchemaManager.get_schema()))

    op.create_table(
        "export_request",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("owner_id", sa.Uuid(), sa.ForeignKey("user_account.id"), nullable=False),
        sa.Column("status", sa.String(10), nullable=False, server_default="queued"),
        sa.Column("modules", sa.ARRAY(sa.String(10)), nullable=False),
        sa.Column("include_images", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("requested_at", TZ, nullable=False, server_default=sa.func.now()),
        sa.Column("started_at", TZ),
        sa.Column("finished_at", TZ),
        sa.Column("expires_at", TZ),
        sa.Column("file_key", sa.String(200)),
        sa.Column("size_bytes", sa.BigInteger()),
        sa.Column("counts", sa.JSON()),
        sa.Column("error", sa.String(64)),
        sa.Column("created_at", TZ, nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", TZ, nullable=False, server_default=sa.func.now()),
        sa.Column("version", sa.BigInteger(), nullable=False, server_default="1"),
        sa.CheckConstraint(
            "status in ('queued', 'running', 'ready', 'failed', 'expired')",
            name="ck_export_request_status_valid",
        ),
    )
    op.create_index("ix_export_request_owner", "export_request", ["owner_id", "requested_at"])

    for statement in (
        *self_policies("export_request"),
        *forbid_delete_triggers("export_request"),
        *record_time_triggers("export_request", created_at=True, updated_at=True),
        *(s for table in QUEUE_TABLES_WITHOUT_DELETE for s in forbid_delete_triggers(table)),
    ):
        op.execute(statement)


def downgrade() -> None:
    raise NotImplementedError("Migrations are forward-only (SRS 4.5); restore from backup to roll back.")
