"""Per-user settings (FR-ACC-09, FR-CAL-23/27, owner decision D-50).

+++===+++ 2026-10-19 — Hasan Alizada — HAAL-045. Forward-only.
- user_settings: one row per user (owner_id is the key, so the owner-only "self" row-level security applies as for
  export requests). Rows of existing users are created here; a new user's row is created on first use (under
  row-level security only the user may create it).
- Never deleted (no-delete triggers); created_at / updated_at kept by the record-time triggers; version for If-Match.
- Not audited: preferences are neither content nor an account change relevant to administrators (D-37, D-50).

Revision ID: 0012
Revises: 0011
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

from haalendar.record_times import record_time_triggers
from haalendar.security.no_delete import forbid_delete_triggers
from haalendar.security.rls import self_policies

revision: str = "0012"
down_revision: str | None = "0011"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

TZ = sa.DateTime(timezone=True)
COLORS = "('red', 'orange', 'yellow', 'green', 'blue', 'purple', 'brown', 'black')"


def upgrade() -> None:
    op.create_table(
        "user_settings",
        sa.Column("owner_id", sa.Uuid(), sa.ForeignKey("user_account.id"), primary_key=True),
        sa.Column("week_start", sa.SmallInteger(), nullable=False, server_default="1"),
        sa.Column("time_format", sa.String(3), nullable=False, server_default="24h"),
        sa.Column("theme", sa.String(6), nullable=False, server_default="system"),
        sa.Column("default_color", sa.String(10), nullable=False, server_default="brown"),
        sa.Column("agenda_days", sa.SmallInteger(), nullable=False, server_default="30"),
        sa.Column("week_ab_enabled", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("week_ab_anchor", sa.Date()),
        sa.Column("week_ab_labels", sa.ARRAY(sa.String(10)), nullable=False, server_default="{A,B}"),
        sa.Column("created_at", TZ, nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", TZ, nullable=False, server_default=sa.func.now()),
        sa.Column("version", sa.BigInteger(), nullable=False, server_default="1"),
        sa.Column("sync_seq", sa.BigInteger()),
        sa.CheckConstraint("week_start BETWEEN 0 AND 6", name="ck_user_settings_week_start_range"),
        sa.CheckConstraint("time_format in ('24h', '12h')", name="ck_user_settings_time_format_valid"),
        sa.CheckConstraint("theme in ('system', 'light', 'dark')", name="ck_user_settings_theme_valid"),
        sa.CheckConstraint(f"default_color in {COLORS}", name="ck_user_settings_default_color_valid"),
        sa.CheckConstraint("agenda_days BETWEEN 1 AND 365", name="ck_user_settings_agenda_days_range"),
        sa.CheckConstraint(
            "cardinality(week_ab_labels) = 2 "
            "AND char_length(week_ab_labels[1]) BETWEEN 1 AND 10 "
            "AND char_length(week_ab_labels[2]) BETWEEN 1 AND 10 "
            "AND lower(week_ab_labels[1]) <> lower(week_ab_labels[2])",
            name="ck_user_settings_week_ab_labels_valid",
        ),
        sa.CheckConstraint(
            "NOT week_ab_enabled OR week_ab_anchor IS NOT NULL", name="ck_user_settings_week_ab_anchor_set"
        ),
    )
    for statement in (
        *self_policies("user_settings"),
        *forbid_delete_triggers("user_settings"),
        *record_time_triggers("user_settings", created_at=True, updated_at=True),
    ):
        op.execute(statement)
    # Existing users get their defaults now (the migration role is not restricted by row-level security).
    op.execute("INSERT INTO user_settings (owner_id) SELECT id FROM user_account ON CONFLICT DO NOTHING")


def downgrade() -> None:
    raise NotImplementedError("Migrations are forward-only (SRS 4.5); restore from backup to roll back.")
