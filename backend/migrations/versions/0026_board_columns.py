"""Columns of Kanban boards (FR-KAN-02, domain model 5.3, owner decision D-91).

+++===+++ 2026-10-29 — Hasan Alizada — HAAL-111. Forward-only.
- `board_column`: one column of a board — name 1-60 (not blank), position (fractional index of letters and digits, left
  to right), wip_limit (NULL = none, else 1-999), archived_at. Carries its board as container (container_kind `board`,
  container_id = board_id, checked) for row-level security: read by whoever reads the board, written by its owner or
  an edit share, the author column is created_by. Synced (sync stamp, live updates to the board's audience), audited,
  soft-deleted only; a board's delete takes its columns into the same batch.
- The sync high-water and live-notify functions are re-created with the new table.

Revision ID: 0026
Revises: 0025
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

from haalendar.audit.sql import audit_trigger
from haalendar.live.sql import NOTIFY_FUNCTION_0026, notify_trigger
from haalendar.record_times import record_time_triggers
from haalendar.security.no_delete import forbid_delete_triggers
from haalendar.security.rls import content_policies
from haalendar.sync.sql import high_water_function, sync_stamp_trigger

revision: str = "0026"
down_revision: str | None = "0025"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

TZ = sa.DateTime(timezone=True)
SYNCED_AFTER_0026 = (
    "calendar",
    "share",
    "item",
    "attachment",
    "user_settings",
    "reminder",
    "checklist_item",
    "board",
    "board_column",
)


def upgrade() -> None:
    op.create_table(
        "board_column",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("board_id", sa.Uuid(), sa.ForeignKey("board.id"), nullable=False),
        sa.Column("container_kind", sa.String(10), nullable=False, server_default="board"),
        sa.Column("container_id", sa.Uuid(), nullable=False),
        sa.Column("name", sa.String(60), nullable=False),
        sa.Column("position", sa.String(64), nullable=False),
        sa.Column("wip_limit", sa.SmallInteger()),
        sa.Column("archived_at", TZ),
        sa.Column("created_at", TZ, nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", TZ, nullable=False, server_default=sa.func.now()),
        sa.Column("created_by", sa.Uuid(), sa.ForeignKey("user_account.id")),
        sa.Column("updated_by", sa.Uuid(), sa.ForeignKey("user_account.id")),
        sa.Column("deleted_at", TZ),
        sa.Column("delete_batch_id", sa.Uuid()),
        sa.Column("version", sa.BigInteger(), nullable=False, server_default="1"),
        sa.Column("sync_seq", sa.BigInteger()),
        sa.CheckConstraint(
            "container_kind = 'board' AND container_id = board_id", name="ck_board_column_board_container"
        ),
        sa.CheckConstraint("char_length(btrim(name)) BETWEEN 1 AND 60", name="ck_board_column_name_length"),
        sa.CheckConstraint("position ~ '^[0-9A-Za-z]{1,64}$'", name="ck_board_column_position_valid"),
        sa.CheckConstraint(
            "wip_limit IS NULL OR wip_limit BETWEEN 1 AND 999", name="ck_board_column_wip_limit_range"
        ),
    )
    op.execute(
        "ALTER TABLE board_column ADD COLUMN sync_xid xid8"
    )  # as migration 0014 added it to synced tables
    op.create_index("ix_board_column_board_id", "board_column", ["board_id"])
    op.create_index("ix_board_column_container", "board_column", ["container_kind", "container_id"])
    op.create_index("ix_board_column_sync_seq", "board_column", ["sync_seq"])

    for statement in (
        *content_policies("board_column", "created_by"),
        *forbid_delete_triggers("board_column"),
        *record_time_triggers("board_column", created_at=True, updated_at=True),
        audit_trigger("board_column", "ref"),
        sync_stamp_trigger("board_column"),
        high_water_function(SYNCED_AFTER_0026),
        NOTIFY_FUNCTION_0026,
        notify_trigger("board_column"),
    ):
        op.execute(statement)


def downgrade() -> None:
    raise NotImplementedError("Migrations are forward-only (SRS 4.5); restore from backup to roll back.")
