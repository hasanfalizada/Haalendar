"""Audit log: append-only table, database triggers on every audited table, row-level security (FR-X-03).

+++===+++ 2026-10-16 — Hasan Alizada — HAAL-032. Forward-only. Tables created later add their audit trigger themselves
(haalendar.audit.sql.audit_trigger) or are listed as exempt.

Revision ID: 0009
Revises: 0008
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import JSONB

from haalendar.audit.sql import (
    AUDIT_FUNCTION,
    FORBID_UPDATE_FUNCTION,
    append_only_trigger,
    audit_read_policy,
    audit_trigger,
)
from haalendar.security.no_delete import forbid_delete_triggers

revision: str = "0009"
down_revision: str | None = "0008"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

TZ = sa.DateTime(timezone=True)

# Frozen copy of the audit configuration at this revision (the registry in haalendar.audit.sql may grow later).
TABLES: dict[str, tuple[str, tuple[str, ...]]] = {
    "user_account": (
        "none",
        (
            "password_hash",
            "totp_secret_enc",
            "totp_pending_secret_enc",
            "totp_last_step",
            "failed_login_count",
            "last_login_at",
        ),
    ),
    "instance_settings": ("singleton", ()),
    "calendar": ("self:calendar", ()),
    "share": ("ref", ()),
}


def upgrade() -> None:
    op.create_table(
        "audit_log",
        sa.Column("id", sa.Uuid(), primary_key=True, server_default=sa.text("uuidv7()")),
        sa.Column("occurred_at", TZ, nullable=False, server_default=sa.func.now()),
        sa.Column("actor_id", sa.Uuid(), sa.ForeignKey("user_account.id")),
        sa.Column("action", sa.String(16), nullable=False),
        sa.Column("entity_type", sa.String(64), nullable=False),
        sa.Column("entity_id", sa.Uuid(), nullable=False),
        sa.Column("container_kind", sa.String(10)),
        sa.Column("container_id", sa.Uuid()),
        sa.Column("before", JSONB()),
        sa.Column("after", JSONB()),
        sa.Column("request_id", sa.String(64)),
        sa.CheckConstraint(
            "action in ('create', 'update', 'delete', 'restore', 'move', 'share', 'unshare', 'login', 'logout', "
            "'admin')",
            name="ck_audit_log_action_valid",
        ),
    )
    op.create_index("ix_audit_log_entity", "audit_log", ["entity_type", "entity_id", "occurred_at"])
    op.create_index("ix_audit_log_actor", "audit_log", ["actor_id", "occurred_at"])
    op.create_index("ix_audit_log_container", "audit_log", ["container_kind", "container_id", "occurred_at"])

    for statement in (
        FORBID_UPDATE_FUNCTION,
        append_only_trigger("audit_log"),
        *forbid_delete_triggers("audit_log"),
        *audit_read_policy(),
        AUDIT_FUNCTION,
    ):
        op.execute(statement)
    for table, (mode, excluded) in TABLES.items():
        op.execute(audit_trigger(table, mode, excluded))


def downgrade() -> None:
    raise NotImplementedError("Migrations are forward-only (SRS 4.5); restore from backup to roll back.")
