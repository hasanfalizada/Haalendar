"""Links between items (FR-INT-01, owner decision D-98).

+++===+++ 2026-10-30 — Hasan Alizada — HAAL-120. Forward-only.
- `link`: two items (event, note, card) linked — the first end's container as `container_kind` / `container_id`, the
  second's as `to_container_kind` / `to_container_id`; origin `manual` (time blocking and conversion later); never an
  item with itself; at most one live link per unordered pair. Row-level security of its own (link_policies): read by
  whoever reads either end, written by whoever reads both and may write one. Synced, audited, soft-deleted only; an
  item's delete leaves its links alone (they show it in the trash and work again once it is restored).
- The sync high-water and live-notify functions are re-created (a link is told to both ends' audiences).

Revision ID: 0030
Revises: 0029
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

from haalendar.audit.sql import audit_trigger
from haalendar.live.sql import NOTIFY_FUNCTION_0030, notify_trigger
from haalendar.planning.link_sql import link_policies
from haalendar.record_times import record_time_triggers
from haalendar.security.no_delete import forbid_delete_triggers
from haalendar.sync.sql import high_water_function, sync_stamp_trigger

revision: str = "0030"
down_revision: str | None = "0029"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

TZ = sa.DateTime(timezone=True)
KINDS = "'calendar', 'note', 'board'"
SYNCED_AFTER_0030 = (
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
)


def upgrade() -> None:
    op.create_table(
        "link",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("from_item_id", sa.Uuid(), sa.ForeignKey("item.id"), nullable=False),
        sa.Column("to_item_id", sa.Uuid(), sa.ForeignKey("item.id"), nullable=False),
        sa.Column("container_kind", sa.String(10), nullable=False),
        sa.Column("container_id", sa.Uuid(), nullable=False),
        sa.Column("to_container_kind", sa.String(10), nullable=False),
        sa.Column("to_container_id", sa.Uuid(), nullable=False),
        sa.Column("origin", sa.String(12), nullable=False, server_default="manual"),
        sa.Column("created_at", TZ, nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", TZ, nullable=False, server_default=sa.func.now()),
        sa.Column("created_by", sa.Uuid(), sa.ForeignKey("user_account.id")),
        sa.Column("updated_by", sa.Uuid(), sa.ForeignKey("user_account.id")),
        sa.Column("deleted_at", TZ),
        sa.Column("delete_batch_id", sa.Uuid()),
        sa.Column("version", sa.BigInteger(), nullable=False, server_default="1"),
        sa.Column("sync_seq", sa.BigInteger()),
        sa.CheckConstraint("from_item_id <> to_item_id", name="ck_link_two_items"),
        sa.CheckConstraint(f"container_kind in ({KINDS})", name="ck_link_container_kind"),
        sa.CheckConstraint(f"to_container_kind in ({KINDS})", name="ck_link_to_container_kind"),
        sa.CheckConstraint("origin in ('manual', 'time_block', 'conversion')", name="ck_link_origin"),
    )
    op.create_index("ix_link_from_item_id", "link", ["from_item_id"])
    op.create_index("ix_link_to_item_id", "link", ["to_item_id"])
    op.create_index("ix_link_container", "link", ["container_kind", "container_id"])
    op.create_index("ix_link_to_container", "link", ["to_container_kind", "to_container_id"])
    op.create_index("ix_link_sync_seq", "link", ["sync_seq"])
    op.create_index(
        "uq_link_live_pair",
        "link",
        [sa.text("least(from_item_id, to_item_id)"), sa.text("greatest(from_item_id, to_item_id)")],
        unique=True,
        postgresql_where=sa.text("deleted_at IS NULL"),
    )
    op.execute("ALTER TABLE link ADD COLUMN sync_xid xid8")  # as migration 0014 added it to synced tables

    for statement in (
        *link_policies("link"),
        *forbid_delete_triggers("link"),
        *record_time_triggers("link", created_at=True, updated_at=True),
        audit_trigger("link", "ref"),
        sync_stamp_trigger("link"),
        notify_trigger("link"),
        high_water_function(SYNCED_AFTER_0030),
        NOTIFY_FUNCTION_0030,
    ):
        op.execute(statement)


def downgrade() -> None:
    raise NotImplementedError("Migrations are forward-only (SRS 4.5); restore from backup to roll back.")
