"""Card comments (FR-KAN-05, owner decision D-123).

+++===+++ 2026-11-24 17:41 +04 — Hasan Alizada — HAAL-114. Forward-only.
- `comment`: Markdown on a card by its author (1-10 000 characters), `edited_at` once its text changed; the card's
  board carried as container (content_policies, author author_id: written by the board's owner and edit shares, read
  by whoever reads the board), synced, audited, soft-deleted only. Who may change or delete which comment is checked
  by the service (planning.comments).
- A new comment writes a `comment` notification for the card's assignees except its author.
- The sync high-water and live-notify functions are re-created with the new table.

Revision ID: 0037
Revises: 0036
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

from haalendar.audit.sql import audit_trigger
from haalendar.live.sql import NOTIFY_FUNCTION_0037, notify_trigger
from haalendar.planning.comment_sql import NOTIFY_COMMENT_FUNCTION, NOTIFY_COMMENT_TRIGGER
from haalendar.record_times import record_time_triggers
from haalendar.security.no_delete import forbid_delete_triggers
from haalendar.security.rls import content_policies
from haalendar.sync.sql import high_water_function, sync_stamp_trigger

revision: str = "0037"
down_revision: str | None = "0036"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

TZ = sa.DateTime(timezone=True)
SYNCED_AFTER_0037 = (
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
    "link",
    "comment",
)


def upgrade() -> None:
    op.create_table(
        "comment",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("item_id", sa.Uuid(), sa.ForeignKey("item.id"), nullable=False),
        sa.Column("author_id", sa.Uuid(), sa.ForeignKey("user_account.id"), nullable=False),
        sa.Column("body", sa.Text(), nullable=False),
        sa.Column("edited_at", TZ),
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
        sa.CheckConstraint("container_kind = 'board'", name="ck_comment_board"),
        sa.CheckConstraint("char_length(body) BETWEEN 1 AND 10000", name="ck_comment_body"),
    )
    op.create_index("ix_comment_item_id", "comment", ["item_id"])
    op.create_index("ix_comment_container", "comment", ["container_kind", "container_id"])
    op.create_index("ix_comment_sync_seq", "comment", ["sync_seq"])
    op.execute("ALTER TABLE comment ADD COLUMN sync_xid xid8")  # as migration 0014 added it to synced tables

    for statement in (
        *content_policies("comment", "author_id"),
        *forbid_delete_triggers("comment"),
        *record_time_triggers("comment", created_at=True, updated_at=True),
        audit_trigger("comment", "ref"),
        sync_stamp_trigger("comment"),
        notify_trigger("comment"),
        high_water_function(SYNCED_AFTER_0037),
        NOTIFY_FUNCTION_0037,
        NOTIFY_COMMENT_FUNCTION,
        NOTIFY_COMMENT_TRIGGER,
    ):
        op.execute(statement)


def downgrade() -> None:
    raise NotImplementedError("Migrations are forward-only (SRS 4.5); restore from backup to roll back.")
