"""Kanban cards and board labels (FR-KAN-03, domain model 5.8 and 5.11, owner decision D-92).

+++===+++ 2026-10-29 — Hasan Alizada — HAAL-112. Forward-only.
- `card`: the card details of an item of kind `card` (1:1, same id): its board (copied as container, checked), its
  column, its place in the column (fractional index), a due date with an optional time (no time without a date). Read
  by whoever reads the board, written by its owner or an edit share (content_child_policies); written together with
  its item, so the item's version and sync number move with every change (pull sends the card fields with the item).
- `label`: a label of a board — name 1-40 (not blank, unique on the board among live labels, case ignored), colour of
  the palette. `item_label`: a label on an item, its own row (a set synced as add / remove), at most one live row per
  item and label. Both carry the board as container (content_policies, author created_by), synced, audited, soft-
  deleted only.
- The sync high-water and live-notify functions are re-created with the new tables.

Revision ID: 0027
Revises: 0026
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

from haalendar.audit.sql import audit_trigger
from haalendar.live.sql import NOTIFY_FUNCTION_0027, notify_trigger
from haalendar.record_times import record_time_triggers
from haalendar.security.no_delete import forbid_delete_triggers
from haalendar.security.rls import content_child_policies, content_policies
from haalendar.sync.sql import high_water_function, sync_stamp_trigger

revision: str = "0027"
down_revision: str | None = "0026"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

TZ = sa.DateTime(timezone=True)
COLORS = "'red', 'orange', 'yellow', 'green', 'blue', 'purple', 'brown', 'black'"
SYNCED_AFTER_0027 = (
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
)


def _common() -> list[sa.Column[object]]:
    return [
        sa.Column("created_at", TZ, nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", TZ, nullable=False, server_default=sa.func.now()),
        sa.Column("created_by", sa.Uuid(), sa.ForeignKey("user_account.id")),
        sa.Column("updated_by", sa.Uuid(), sa.ForeignKey("user_account.id")),
        sa.Column("deleted_at", TZ),
        sa.Column("delete_batch_id", sa.Uuid()),
        sa.Column("version", sa.BigInteger(), nullable=False, server_default="1"),
        sa.Column("sync_seq", sa.BigInteger()),
    ]


def upgrade() -> None:
    op.create_table(
        "card",
        sa.Column("id", sa.Uuid(), sa.ForeignKey("item.id"), primary_key=True),
        sa.Column("container_kind", sa.String(10), nullable=False, server_default="board"),
        sa.Column("container_id", sa.Uuid(), nullable=False),
        sa.Column("board_id", sa.Uuid(), sa.ForeignKey("board.id"), nullable=False),
        sa.Column("column_id", sa.Uuid(), sa.ForeignKey("board_column.id"), nullable=False),
        sa.Column("position", sa.String(64), nullable=False),
        sa.Column("due_date", sa.Date()),
        sa.Column("due_time", sa.Time()),
        sa.CheckConstraint(
            "container_kind = 'board' AND container_id = board_id", name="ck_card_board_container"
        ),
        sa.CheckConstraint("position ~ '^[0-9A-Za-z]{1,64}$'", name="ck_card_position_valid"),
        sa.CheckConstraint("due_time IS NULL OR due_date IS NOT NULL", name="ck_card_due_time_needs_date"),
    )
    op.create_index("ix_card_board_id", "card", ["board_id"])
    op.create_index("ix_card_column_id", "card", ["column_id"])

    op.create_table(
        "label",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("board_id", sa.Uuid(), sa.ForeignKey("board.id"), nullable=False),
        sa.Column("container_kind", sa.String(10), nullable=False, server_default="board"),
        sa.Column("container_id", sa.Uuid(), nullable=False),
        sa.Column("name", sa.String(40), nullable=False),
        sa.Column("color", sa.String(10), nullable=False),
        *_common(),
        sa.CheckConstraint(
            "container_kind = 'board' AND container_id = board_id", name="ck_label_board_container"
        ),
        sa.CheckConstraint("char_length(btrim(name)) BETWEEN 1 AND 40", name="ck_label_name_length"),
        sa.CheckConstraint(f"color in ({COLORS})", name="ck_label_color_valid"),
    )
    op.create_index("ix_label_board_id", "label", ["board_id"])
    op.create_index("ix_label_sync_seq", "label", ["sync_seq"])
    op.create_index(
        "uq_label_name_per_board",
        "label",
        ["board_id", sa.text("lower(name)")],
        unique=True,
        postgresql_where=sa.text("deleted_at IS NULL"),
    )

    op.create_table(
        "item_label",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("item_id", sa.Uuid(), sa.ForeignKey("item.id"), nullable=False),
        sa.Column("label_id", sa.Uuid(), sa.ForeignKey("label.id"), nullable=False),
        sa.Column("container_kind", sa.String(10), nullable=False),
        sa.Column("container_id", sa.Uuid(), nullable=False),
        *_common(),
        sa.CheckConstraint("container_kind in ('note', 'board')", name="ck_item_label_container_kind_valid"),
    )
    op.create_index("ix_item_label_item_id", "item_label", ["item_id"])
    op.create_index("ix_item_label_label_id", "item_label", ["label_id"])
    op.create_index("ix_item_label_container", "item_label", ["container_kind", "container_id"])
    op.create_index("ix_item_label_sync_seq", "item_label", ["sync_seq"])
    op.create_index(
        "uq_item_label_live",
        "item_label",
        ["item_id", "label_id"],
        unique=True,
        postgresql_where=sa.text("deleted_at IS NULL"),
    )
    for table in ("label", "item_label"):
        op.execute(
            f"ALTER TABLE {table} ADD COLUMN sync_xid xid8"
        )  # as migration 0014 added it to synced tables

    for statement in (
        *content_child_policies("card"),
        *forbid_delete_triggers("card"),
        audit_trigger("card", "ref"),
        *content_policies("label", "created_by"),
        *forbid_delete_triggers("label"),
        *record_time_triggers("label", created_at=True, updated_at=True),
        audit_trigger("label", "ref"),
        sync_stamp_trigger("label"),
        notify_trigger("label"),
        *content_policies("item_label", "created_by"),
        *forbid_delete_triggers("item_label"),
        *record_time_triggers("item_label", created_at=True, updated_at=True),
        audit_trigger("item_label", "ref"),
        sync_stamp_trigger("item_label"),
        notify_trigger("item_label"),
        high_water_function(SYNCED_AFTER_0027),
        NOTIFY_FUNCTION_0027,
    ):
        op.execute(statement)


def downgrade() -> None:
    raise NotImplementedError("Migrations are forward-only (SRS 4.5); restore from backup to roll back.")
