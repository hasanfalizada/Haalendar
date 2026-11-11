"""In-app notifications (FR-X-21, owner decision D-52).

+++===+++ 2026-10-19 — Hasan Alizada — HAAL-048. Forward-only.
- notification: one row per notification for one user, owner-only row-level security ("self"), never deleted, not
  audited (service data, D-52); only read_at / delivered_push_at may change (guard trigger); created_at kept by the
  record-time trigger.
- share: AFTER INSERT / UPDATE OF revoked_at trigger writes share_received / share_revoked for the grantee
  (haalendar.notifications.sql).

Revision ID: 0013
Revises: 0012
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import JSONB

from haalendar.notifications.sql import (
    KINDS,
    NOTIFY_SHARE_FUNCTION,
    NOTIFY_SHARE_TRIGGER,
    ONLY_READ_STATE_FUNCTION,
    ONLY_READ_STATE_TRIGGER,
)
from haalendar.record_times import record_time_triggers
from haalendar.security.no_delete import forbid_delete_triggers
from haalendar.security.rls import self_policies

revision: str = "0013"
down_revision: str | None = "0012"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

TZ = sa.DateTime(timezone=True)


def upgrade() -> None:
    op.create_table(
        "notification",
        sa.Column("id", sa.Uuid(), primary_key=True, server_default=sa.text("uuidv7()")),
        sa.Column("owner_id", sa.Uuid(), sa.ForeignKey("user_account.id"), nullable=False),
        sa.Column("kind", sa.String(20), nullable=False),
        sa.Column("item_id", sa.Uuid(), sa.ForeignKey("item.id")),
        sa.Column("payload", JSONB(), nullable=False, server_default="{}"),
        sa.Column("created_at", TZ, nullable=False, server_default=sa.func.now()),
        sa.Column("read_at", TZ),
        sa.Column("delivered_push_at", TZ),
        sa.CheckConstraint(
            f"kind in ({', '.join(repr(k) for k in KINDS)})", name="ck_notification_kind_valid"
        ),
    )
    op.create_index("ix_notification_owner", "notification", ["owner_id", sa.text("id DESC")])
    op.create_index(
        "ix_notification_owner_unread",
        "notification",
        ["owner_id"],
        postgresql_where=sa.text("read_at IS NULL"),
    )
    for statement in (
        *self_policies("notification"),
        *forbid_delete_triggers("notification"),
        *record_time_triggers("notification", created_at=True, updated_at=False),
        ONLY_READ_STATE_FUNCTION,
        ONLY_READ_STATE_TRIGGER,
        NOTIFY_SHARE_FUNCTION,
        NOTIFY_SHARE_TRIGGER,
    ):
        op.execute(statement)


def downgrade() -> None:
    raise NotImplementedError("Migrations are forward-only (SRS 4.5); restore from backup to roll back.")
