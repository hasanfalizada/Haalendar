"""Kanban boards (FR-KAN-01, domain model 5.3, owner decision D-90).

+++===+++ 2026-10-29 — Hasan Alizada — HAAL-110. Forward-only.
- `board`: a container like `calendar` — owner, name 1-100 (not blank), position (the owner's board order, fractional
  index of letters and digits), archived_at (archive ≠ delete). Read by its owner and everyone it is shared with,
  written by its owner only (container_policies); never deleted physically; audited as a container; synced (sync
  stamp, live updates to its audience).
- `haalendar_owns_container` and `haalendar_sync_audience` learn the container kind `board`; the share notification
  names a board too; the sync high-water and live-notify functions are re-created with the new table.

Revision ID: 0025
Revises: 0024
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

from haalendar.audit.sql import audit_trigger
from haalendar.live.sql import AUDIENCE_FUNCTION_0025, NOTIFY_FUNCTION_0025, notify_trigger
from haalendar.notifications.sql import NOTIFY_SHARE_FUNCTION_0025
from haalendar.record_times import record_time_triggers
from haalendar.security.no_delete import forbid_delete_triggers
from haalendar.security.rls import OWNS_CONTAINER_FUNCTION_0025, container_policies
from haalendar.sync.sql import high_water_function, sync_stamp_trigger

revision: str = "0025"
down_revision: str | None = "0024"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

TZ = sa.DateTime(timezone=True)
SYNCED_AFTER_0025 = (
    "calendar",
    "share",
    "item",
    "attachment",
    "user_settings",
    "reminder",
    "checklist_item",
    "board",
)


def upgrade() -> None:
    op.create_table(
        "board",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("owner_id", sa.Uuid(), sa.ForeignKey("user_account.id"), nullable=False),
        sa.Column("name", sa.String(100), nullable=False),
        sa.Column("position", sa.String(64), nullable=False),
        sa.Column("archived_at", TZ),
        sa.Column("created_at", TZ, nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", TZ, nullable=False, server_default=sa.func.now()),
        sa.Column("created_by", sa.Uuid(), sa.ForeignKey("user_account.id")),
        sa.Column("updated_by", sa.Uuid(), sa.ForeignKey("user_account.id")),
        sa.Column("deleted_at", TZ),
        sa.Column("delete_batch_id", sa.Uuid()),
        sa.Column("version", sa.BigInteger(), nullable=False, server_default="1"),
        sa.Column("sync_seq", sa.BigInteger()),
        sa.CheckConstraint("char_length(btrim(name)) BETWEEN 1 AND 100", name="ck_board_name_length"),
        sa.CheckConstraint("position ~ '^[0-9A-Za-z]{1,64}$'", name="ck_board_position_valid"),
    )
    op.execute("ALTER TABLE board ADD COLUMN sync_xid xid8")  # as migration 0014 added it to synced tables
    op.create_index("ix_board_owner_id", "board", ["owner_id"])
    op.create_index("ix_board_sync_seq", "board", ["sync_seq"])

    for statement in (
        OWNS_CONTAINER_FUNCTION_0025,
        AUDIENCE_FUNCTION_0025,
        NOTIFY_SHARE_FUNCTION_0025,
        *container_policies("board", "board"),
        *forbid_delete_triggers("board"),
        *record_time_triggers("board", created_at=True, updated_at=True),
        audit_trigger("board", "self:board"),
        sync_stamp_trigger("board"),
        high_water_function(SYNCED_AFTER_0025),
        NOTIFY_FUNCTION_0025,
        notify_trigger("board"),
    ):
        op.execute(statement)


def downgrade() -> None:
    raise NotImplementedError("Migrations are forward-only (SRS 4.5); restore from backup to roll back.")
