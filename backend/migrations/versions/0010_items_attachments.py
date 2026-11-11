"""Item supertype and image attachments (FR-X-11, domain model 5.4 and 5.13, owner decision D-45).

+++===+++ 2026-10-17 — Hasan Alizada — HAAL-040. Forward-only. Both tables are content rows: row-level security via
their container (content_policies), no physical delete, record times and the audit log like every table.

Revision ID: 0010
Revises: 0009
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

from haalendar.audit.sql import audit_trigger
from haalendar.record_times import record_time_triggers
from haalendar.security.no_delete import forbid_delete_triggers
from haalendar.security.rls import content_policies

revision: str = "0010"
down_revision: str | None = "0009"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

TZ = sa.DateTime(timezone=True)
COLORS = "'red', 'orange', 'yellow', 'green', 'blue', 'purple', 'brown', 'black'"


def common_columns() -> list[sa.Column[object]]:
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
        "item",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("kind", sa.String(10), nullable=False),
        sa.Column("owner_id", sa.Uuid(), sa.ForeignKey("user_account.id"), nullable=False),
        sa.Column("container_kind", sa.String(10), nullable=False),
        sa.Column("container_id", sa.Uuid(), nullable=False),
        sa.Column("title", sa.String(200), nullable=False, server_default=""),
        sa.Column("body", sa.Text()),
        sa.Column("color", sa.String(10), nullable=False, server_default="brown"),
        sa.Column("priority", sa.String(10), nullable=False, server_default="medium"),
        sa.Column("legacy_id", sa.Integer()),
        *common_columns(),
        sa.CheckConstraint("kind in ('event', 'note', 'card')", name="ck_item_kind_valid"),
        sa.CheckConstraint(
            "container_kind in ('calendar', 'board', 'note')", name="ck_item_container_kind_valid"
        ),
        sa.CheckConstraint("char_length(title) <= 200", name="ck_item_title_length"),
        sa.CheckConstraint(f"color in ({COLORS})", name="ck_item_color_valid"),
        sa.CheckConstraint("priority in ('low', 'medium', 'high')", name="ck_item_priority_valid"),
    )
    op.create_index("ix_item_owner_id", "item", ["owner_id"])
    op.create_index("ix_item_container", "item", ["container_kind", "container_id"])

    op.create_table(
        "attachment",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("item_id", sa.Uuid(), sa.ForeignKey("item.id"), nullable=False),
        sa.Column("container_kind", sa.String(10), nullable=False),
        sa.Column("container_id", sa.Uuid(), nullable=False),
        sa.Column("uploaded_by", sa.Uuid(), sa.ForeignKey("user_account.id"), nullable=False),
        sa.Column("file_name", sa.String(120), nullable=False),
        sa.Column("media_type", sa.String(20), nullable=False),
        sa.Column("size_bytes", sa.Integer(), nullable=False),
        sa.Column("width", sa.Integer()),
        sa.Column("height", sa.Integer()),
        sa.Column("content_hash", sa.String(64), nullable=False),
        sa.Column("storage_key", sa.String(200), nullable=False),
        sa.Column("thumbnail_key", sa.String(200), nullable=False),
        *common_columns(),
        sa.CheckConstraint(
            "media_type in ('image/png', 'image/jpeg', 'image/webp', 'image/gif')",
            name="ck_attachment_media_type_valid",
        ),
        sa.CheckConstraint("size_bytes BETWEEN 1 AND 10485760", name="ck_attachment_size_valid"),
        sa.CheckConstraint(
            "container_kind in ('calendar', 'board', 'note')", name="ck_attachment_container_kind_valid"
        ),
    )
    op.create_index("ix_attachment_item_id", "attachment", ["item_id"])

    for statement in (
        *content_policies("item", "owner_id"),
        *content_policies("attachment", "uploaded_by"),
        *forbid_delete_triggers("item"),
        *forbid_delete_triggers("attachment"),
        *record_time_triggers("item", created_at=True, updated_at=True),
        *record_time_triggers("attachment", created_at=True, updated_at=True),
        audit_trigger("item", "ref"),
        audit_trigger("attachment", "ref", ("storage_key", "thumbnail_key")),
    ):
        op.execute(statement)


def downgrade() -> None:
    raise NotImplementedError("Migrations are forward-only (SRS 4.5); restore from backup to roll back.")
