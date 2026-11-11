"""Checklist items of notes (FR-TODO-02, domain model 5.10, owner decision D-88).

+++===+++ 2026-10-29 — Hasan Alizada — HAAL-101. Forward-only.
- `checklist_item`: one item of a note's checklist (cards later) — text 1-500, checked with the time it was checked,
  position (fractional index of letters and digits). Carries the note's container_kind / container_id (like
  attachments) for row-level security: read by whoever reads the note, written by its owner or an edit share, the
  author column is created_by. Synced (sync stamp, live updates to the container's audience), audited, soft-deleted
  only; a note's delete takes its items into the same batch.
- The sync high-water and live-notify functions are re-created with the new table.

Revision ID: 0023
Revises: 0022
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

from haalendar.audit.sql import audit_trigger
from haalendar.live.sql import NOTIFY_FUNCTION_0023, notify_trigger
from haalendar.record_times import record_time_triggers
from haalendar.security.no_delete import forbid_delete_triggers
from haalendar.security.rls import content_policies
from haalendar.sync.sql import high_water_function, sync_stamp_trigger

revision: str = "0023"
down_revision: str | None = "0022"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

TZ = sa.DateTime(timezone=True)
SYNCED_AFTER_0023 = ("calendar", "share", "item", "attachment", "user_settings", "reminder", "checklist_item")


def upgrade() -> None:
    op.create_table(
        "checklist_item",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("item_id", sa.Uuid(), sa.ForeignKey("item.id"), nullable=False),
        sa.Column("container_kind", sa.String(10), nullable=False),
        sa.Column("container_id", sa.Uuid(), nullable=False),
        sa.Column("text", sa.String(500), nullable=False),
        sa.Column("checked", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("checked_at", TZ),
        sa.Column("position", sa.String(64), nullable=False),
        sa.Column("created_at", TZ, nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", TZ, nullable=False, server_default=sa.func.now()),
        sa.Column("created_by", sa.Uuid(), sa.ForeignKey("user_account.id")),
        sa.Column("updated_by", sa.Uuid(), sa.ForeignKey("user_account.id")),
        sa.Column("deleted_at", TZ),
        sa.Column("delete_batch_id", sa.Uuid()),
        sa.Column("version", sa.BigInteger(), nullable=False, server_default="1"),
        sa.Column("sync_seq", sa.BigInteger()),
        sa.CheckConstraint(
            "container_kind in ('note', 'board')", name="ck_checklist_item_container_kind_valid"
        ),
        sa.CheckConstraint(
            "char_length(btrim(text)) BETWEEN 1 AND 500", name="ck_checklist_item_text_length"
        ),
        sa.CheckConstraint("position ~ '^[0-9A-Za-z]{1,64}$'", name="ck_checklist_item_position_valid"),
        sa.CheckConstraint("checked = (checked_at IS NOT NULL)", name="ck_checklist_item_checked_at"),
    )
    op.execute(
        "ALTER TABLE checklist_item ADD COLUMN sync_xid xid8"
    )  # as migration 0014 added it to synced tables
    op.create_index("ix_checklist_item_item", "checklist_item", ["item_id"])
    op.create_index("ix_checklist_item_container", "checklist_item", ["container_kind", "container_id"])
    op.create_index("ix_checklist_item_sync_seq", "checklist_item", ["sync_seq"])

    for statement in (
        *content_policies("checklist_item", "created_by"),
        *forbid_delete_triggers("checklist_item"),
        *record_time_triggers("checklist_item", created_at=True, updated_at=True),
        audit_trigger("checklist_item", "ref"),
        sync_stamp_trigger("checklist_item"),
        high_water_function(SYNCED_AFTER_0023),
        NOTIFY_FUNCTION_0023,
        notify_trigger("checklist_item"),
    ):
        op.execute(statement)


def downgrade() -> None:
    raise NotImplementedError("Migrations are forward-only (SRS 4.5); restore from backup to roll back.")
