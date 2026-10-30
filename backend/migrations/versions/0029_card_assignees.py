"""Card assignees (FR-KAN-10, owner decision D-97).

+++===+++ 2026-10-30 — Hasan Alizada — HAAL-119. Forward-only.
- `card_assignee`: a member of the board on a card — its own row (a set synced as add / remove), at most one live row
  per card and user; the card's board carried as container (content_policies, author created_by: written by the
  board's owner and edit shares, read by whoever reads the board), synced, audited, soft-deleted only.
- `haalendar_board_members(board)`: the owner and active grantees with their permission, for readers of the board.
- An assignment by someone else writes an `assigned` notification for the assignee.
- The sync high-water and live-notify functions are re-created with the new table.

Revision ID: 0029
Revises: 0028
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

from haalendar.audit.sql import audit_trigger
from haalendar.live.sql import NOTIFY_FUNCTION_0029, notify_trigger
from haalendar.planning.assignee_sql import (
    MEMBERS_FUNCTION,
    NOTIFY_ASSIGNED_FUNCTION,
    NOTIFY_ASSIGNED_TRIGGER,
)
from haalendar.record_times import record_time_triggers
from haalendar.security.no_delete import forbid_delete_triggers
from haalendar.security.rls import content_policies
from haalendar.sync.sql import high_water_function, sync_stamp_trigger

revision: str = "0029"
down_revision: str | None = "0028"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

TZ = sa.DateTime(timezone=True)
SYNCED_AFTER_0029 = (
    "calendar",
    "share",
    "item",
    "attachment",
    "user_settings",
    "reminder",
    "checklist_item",
    "board",
    "board_column",
    "label",
    "item_label",
    "card_assignee",
)


def upgrade() -> None:
    op.create_table(
        "card_assignee",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("item_id", sa.Uuid(), sa.ForeignKey("item.id"), nullable=False),
        sa.Column("user_id", sa.Uuid(), sa.ForeignKey("user_account.id"), nullable=False),
        sa.Column("container_kind", sa.String(10), nullable=False, server_default="board"),
        sa.Column("container_id", sa.Uuid(), nullable=False),
        sa.Column("created_at", TZ, nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", TZ, nullable=False, server_default=sa.func.now()),
        sa.Column("created_by", sa.Uuid(), sa.ForeignKey("user_account.id")),
        sa.Column("updated_by", sa.Uuid(), sa.ForeignKey("user_account.id")),
        sa.Column("deleted_at", TZ),
        sa.Column("delete_batch_id", sa.Uuid()),
        sa.Column("version", sa.BigInteger(), nullable=False, server_default="1"),
        sa.Column("sync_seq", sa.BigInteger()),
        sa.CheckConstraint("container_kind = 'board'", name="ck_card_assignee_board"),
    )
    op.create_index("ix_card_assignee_item_id", "card_assignee", ["item_id"])
    op.create_index("ix_card_assignee_user_id", "card_assignee", ["user_id"])
    op.create_index("ix_card_assignee_container", "card_assignee", ["container_kind", "container_id"])
    op.create_index("ix_card_assignee_sync_seq", "card_assignee", ["sync_seq"])
    op.create_index(
        "uq_card_assignee_live",
        "card_assignee",
        ["item_id", "user_id"],
        unique=True,
        postgresql_where=sa.text("deleted_at IS NULL"),
    )
    op.execute(
        "ALTER TABLE card_assignee ADD COLUMN sync_xid xid8"
    )  # as migration 0014 added it to synced tables

    for statement in (
        *content_policies("card_assignee", "created_by"),
        *forbid_delete_triggers("card_assignee"),
        *record_time_triggers("card_assignee", created_at=True, updated_at=True),
        audit_trigger("card_assignee", "ref"),
        sync_stamp_trigger("card_assignee"),
        notify_trigger("card_assignee"),
        high_water_function(SYNCED_AFTER_0029),
        NOTIFY_FUNCTION_0029,
        MEMBERS_FUNCTION,
        NOTIFY_ASSIGNED_FUNCTION,
        NOTIFY_ASSIGNED_TRIGGER,
    ):
        op.execute(statement)


def downgrade() -> None:
    raise NotImplementedError("Migrations are forward-only (SRS 4.5); restore from backup to roll back.")
