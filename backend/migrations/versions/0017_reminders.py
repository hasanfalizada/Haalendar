"""Reminders (FR-CAL-29, domain model 5.12, owner decision D-79).

+++===+++ 2026-10-28 — Hasan Alizada — HAAL-091. Forward-only.
- `reminder`: one reminder of one user on one item — "before" (offset_minutes) or "on the day" (all_day_time and
  all_day_days_before), exactly one of the two forms. Personal (owner-only row-level security, also on shared events),
  synced (sync stamp, live updates to its owner), audited, soft-deleted only.
- `reminder_schedule`: when each reminder fires next and which occurrence fired last (service data, owner-only
  row-level security, never deleted, not audited, not synced). Written by triggers and the worker.
- Triggers: a reminder written by its owner is marked "to check"; changes of events, items, excluded dates and shares
  mark the reminders concerned (haalendar.planning.reminder_sql).
- The sync high-water and live-notify functions are re-created with the new table.
- The domain model's next_fire_at moves to reminder_schedule; its user_id is owner_id (as on the other personal tables).
- The reminder check is a Procrastinate periodic task, whose deferrer removes older rows of
  `procrastinate_periodic_defers`: that table becomes service data (haalendar.security.no_delete.SERVICE_TABLES, DELETE
  granted by haalendar.dbroles), so its no-delete triggers of migration 0011 are dropped.

Revision ID: 0017
Revises: 0016
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

from haalendar.audit.sql import audit_trigger
from haalendar.live.sql import NOTIFY_FUNCTION_0017, notify_trigger
from haalendar.planning.reminder_sql import (
    DUE_FUNCTION,
    RECHECK_ITEM_FUNCTION,
    RECHECKED_TABLES,
    SCHEDULE_ON_WRITE_FUNCTION,
    SCHEDULE_ON_WRITE_TRIGGER,
    recheck_trigger,
)
from haalendar.record_times import record_time_triggers
from haalendar.security.no_delete import forbid_delete_triggers
from haalendar.security.rls import self_policies
from haalendar.sync.sql import high_water_function, sync_stamp_trigger

revision: str = "0017"
down_revision: str | None = "0016"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

TZ = sa.DateTime(timezone=True)
SYNCED_AFTER_0017 = ("calendar", "share", "item", "attachment", "user_settings", "reminder")


def upgrade() -> None:
    op.create_table(
        "reminder",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("item_id", sa.Uuid(), sa.ForeignKey("item.id"), nullable=False),
        sa.Column("owner_id", sa.Uuid(), sa.ForeignKey("user_account.id"), nullable=False),
        sa.Column("offset_minutes", sa.Integer()),
        sa.Column("all_day_time", sa.Time()),
        sa.Column("all_day_days_before", sa.SmallInteger()),
        sa.Column("created_at", TZ, nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", TZ, nullable=False, server_default=sa.func.now()),
        sa.Column("deleted_at", TZ),
        sa.Column("delete_batch_id", sa.Uuid()),
        sa.Column("version", sa.BigInteger(), nullable=False, server_default="1"),
        sa.Column("sync_seq", sa.BigInteger()),
        sa.CheckConstraint(
            "(offset_minutes IS NOT NULL AND all_day_time IS NULL AND all_day_days_before IS NULL) OR "
            "(offset_minutes IS NULL AND all_day_time IS NOT NULL AND all_day_days_before IS NOT NULL)",
            name="ck_reminder_one_form",
        ),
        sa.CheckConstraint("offset_minutes BETWEEN 0 AND 40320", name="ck_reminder_offset_range"),
        sa.CheckConstraint("all_day_days_before BETWEEN 0 AND 28", name="ck_reminder_days_before_range"),
    )
    op.execute(
        "ALTER TABLE reminder ADD COLUMN sync_xid xid8"
    )  # as migration 0014 added it to the synced tables
    op.create_index("ix_reminder_item", "reminder", ["item_id"])
    op.create_index("ix_reminder_owner", "reminder", ["owner_id"])
    op.create_index("ix_reminder_sync_seq", "reminder", ["sync_seq"])

    op.create_table(
        "reminder_schedule",
        sa.Column("reminder_id", sa.Uuid(), sa.ForeignKey("reminder.id"), primary_key=True),
        sa.Column("owner_id", sa.Uuid(), sa.ForeignKey("user_account.id"), nullable=False),
        sa.Column("needs_check", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("next_fire_at", TZ),
        sa.Column("next_occurrence", sa.Date()),
        sa.Column("last_occurrence", sa.Date()),
        sa.Column("last_fired_at", TZ),
    )
    op.create_index(
        "ix_reminder_schedule_due",
        "reminder_schedule",
        ["next_fire_at"],
        postgresql_where=sa.text("next_fire_at IS NOT NULL"),
    )
    op.create_index(
        "ix_reminder_schedule_to_check",
        "reminder_schedule",
        ["reminder_id"],
        postgresql_where=sa.text("needs_check"),
    )

    for statement in (
        *self_policies("reminder"),
        *self_policies("reminder_schedule"),
        *forbid_delete_triggers("reminder"),
        *forbid_delete_triggers("reminder_schedule"),
        *record_time_triggers("reminder", created_at=True, updated_at=True),
        audit_trigger("reminder", "none"),
        sync_stamp_trigger("reminder"),
        high_water_function(SYNCED_AFTER_0017),
        NOTIFY_FUNCTION_0017,
        notify_trigger("reminder"),
        SCHEDULE_ON_WRITE_FUNCTION,
        SCHEDULE_ON_WRITE_TRIGGER,
        RECHECK_ITEM_FUNCTION,
        *(recheck_trigger(table) for table in RECHECKED_TABLES),
        DUE_FUNCTION,
        "DROP TRIGGER haalendar_no_delete ON procrastinate_periodic_defers",
        "DROP TRIGGER haalendar_no_truncate ON procrastinate_periodic_defers",
    ):
        op.execute(statement)


def downgrade() -> None:
    raise NotImplementedError("Migrations are forward-only (SRS 4.5); restore from backup to roll back.")
