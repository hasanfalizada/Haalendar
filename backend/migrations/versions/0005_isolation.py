"""Data isolation: calendar container, container shares and row-level security (FR-ACC-07, ADR-0005).

+++===+++ 2026-10-15 — Hasan Alizada — HAAL-165. Forward-only. Policies come from haalendar.security.rls so that
later container tables (board, note) reuse exactly the same rules.

Revision ID: 0005
Revises: 0004
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

from haalendar.security.rls import (
    CURRENT_USER_FUNCTION,
    SHARE_PERMISSION_FUNCTION,
    container_policies,
    owns_container_function,
    share_policies,
)

revision: str = "0005"
down_revision: str | None = "0004"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

TZ = sa.DateTime(timezone=True)


def upgrade() -> None:
    op.create_table(
        "calendar",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("owner_id", sa.Uuid(), sa.ForeignKey("user_account.id"), nullable=False),
        sa.Column("name", sa.String(100), nullable=False),
        sa.Column("color", sa.String(10), nullable=False, server_default="blue"),
        sa.Column("is_default", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("archived_at", TZ),
        sa.Column("created_at", TZ, nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", TZ, nullable=False, server_default=sa.func.now()),
        sa.Column("created_by", sa.Uuid(), sa.ForeignKey("user_account.id")),
        sa.Column("updated_by", sa.Uuid(), sa.ForeignKey("user_account.id")),
        sa.Column("deleted_at", TZ),
        sa.Column("delete_batch_id", sa.Uuid()),
        sa.Column("version", sa.BigInteger(), nullable=False, server_default="1"),
        sa.Column("sync_seq", sa.BigInteger()),
        sa.CheckConstraint("char_length(name) BETWEEN 1 AND 100", name="ck_calendar_name_length"),
        sa.CheckConstraint(
            "color in ('red', 'orange', 'yellow', 'green', 'blue', 'purple', 'brown', 'black')",
            name="ck_calendar_color_valid",
        ),
    )
    op.create_index("ix_calendar_owner_id", "calendar", ["owner_id"])
    op.create_index(
        "uq_calendar_default_per_owner",
        "calendar",
        ["owner_id"],
        unique=True,
        postgresql_where=sa.text("is_default AND deleted_at IS NULL"),
    )

    op.create_table(
        "share",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("container_kind", sa.String(10), nullable=False),
        sa.Column("container_id", sa.Uuid(), nullable=False),
        sa.Column("grantee_id", sa.Uuid(), sa.ForeignKey("user_account.id"), nullable=False),
        sa.Column("permission", sa.String(10), nullable=False),
        sa.Column("granted_by", sa.Uuid(), sa.ForeignKey("user_account.id"), nullable=False),
        sa.Column("created_at", TZ, nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", TZ, nullable=False, server_default=sa.func.now()),
        sa.Column("revoked_at", TZ),
        sa.Column("version", sa.BigInteger(), nullable=False, server_default="1"),
        sa.Column("sync_seq", sa.BigInteger()),
        sa.CheckConstraint(
            "container_kind in ('calendar', 'board', 'note')", name="ck_share_container_kind_valid"
        ),
        sa.CheckConstraint("permission in ('view', 'edit')", name="ck_share_permission_valid"),
    )
    op.create_index("ix_share_grantee_id", "share", ["grantee_id"])
    op.create_index(
        "uq_share_active_grantee",
        "share",
        ["container_kind", "container_id", "grantee_id"],
        unique=True,
        postgresql_where=sa.text("revoked_at IS NULL"),
    )

    for statement in (
        CURRENT_USER_FUNCTION,
        SHARE_PERMISSION_FUNCTION,
        owns_container_function({"calendar": "calendar"}),
        *container_policies("calendar", "calendar"),
        *share_policies(),
    ):
        op.execute(statement)


def downgrade() -> None:
    raise NotImplementedError("Migrations are forward-only (SRS 4.5); restore from backup to roll back.")
