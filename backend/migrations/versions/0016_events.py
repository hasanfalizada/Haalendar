"""Events and recurrence (FR-CAL-06, FR-CAL-10, domain model 5.5-5.6, owner decision D-60).

+++===+++ 2026-10-22 — Hasan Alizada — HAAL-066. Forward-only.
- `event`: the event details of an item of kind `event` (1:1, same id). container_kind / container_id are copied from
  the item (like attachments), so row-level security, the authz atom and the audit log treat it like other content.
  Wall-clock times with their zone (time-handling.md); start_utc / end_utc derived for timed events (the first
  occurrence of a series). Rules as CHECKs: end ≥ start, all-day without times, timed with both times, RRULE one of
  the four supported values (calendar.recurrence.v1), a series spans one day (FR-CAL-10).
- `recurrence_exception`: a removed or overridden occurrence of a series (operations in HAAL-067); soft-deleted only.
- Both: no physical delete, audited; events are written together with their item, so the item's version and sync
  number move with every change (pull sends the event fields with the item).

Revision ID: 0016
Revises: 0015
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

from haalendar.audit.sql import audit_trigger
from haalendar.record_times import record_time_triggers
from haalendar.security.no_delete import forbid_delete_triggers
from haalendar.security.rls import content_child_policies, content_policies

revision: str = "0016"
down_revision: str | None = "0015"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

TZ = sa.DateTime(timezone=True)
RRULES = "('FREQ=DAILY', 'FREQ=WEEKLY', 'FREQ=MONTHLY', 'FREQ=YEARLY')"


def upgrade() -> None:
    op.create_table(
        "event",
        sa.Column("id", sa.Uuid(), sa.ForeignKey("item.id"), primary_key=True),
        sa.Column("container_kind", sa.String(10), nullable=False),
        sa.Column("container_id", sa.Uuid(), nullable=False),
        sa.Column("all_day", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("start_date", sa.Date(), nullable=False),
        sa.Column("start_time", sa.Time()),
        sa.Column("end_date", sa.Date(), nullable=False),
        sa.Column("end_time", sa.Time()),
        sa.Column("tzid", sa.String(64), nullable=False),
        sa.Column("start_utc", TZ),
        sa.Column("end_utc", TZ),
        sa.Column("location", sa.String(500)),
        sa.Column("rrule", sa.String(500)),
        sa.CheckConstraint("container_kind = 'calendar'", name="ck_event_container_kind_valid"),
        sa.CheckConstraint("end_date >= start_date", name="ck_event_end_after_start"),
        sa.CheckConstraint(
            "(all_day AND start_time IS NULL AND end_time IS NULL) OR "
            "(NOT all_day AND start_time IS NOT NULL AND end_time IS NOT NULL "
            "AND (end_date > start_date OR end_time >= start_time))",
            name="ck_event_times_valid",
        ),
        sa.CheckConstraint(f"rrule IS NULL OR rrule IN {RRULES}", name="ck_event_rrule_supported"),
        sa.CheckConstraint("rrule IS NULL OR end_date = start_date", name="ck_event_series_spans_one_day"),
    )
    op.create_index("ix_event_container", "event", ["container_kind", "container_id"])
    op.create_index("ix_event_start_date", "event", ["start_date"])

    op.create_table(
        "recurrence_exception",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("event_id", sa.Uuid(), sa.ForeignKey("event.id"), nullable=False),
        sa.Column("container_kind", sa.String(10), nullable=False),
        sa.Column("container_id", sa.Uuid(), nullable=False),
        sa.Column("occurrence_date", sa.Date(), nullable=False),
        sa.Column("kind", sa.String(10), nullable=False),
        sa.Column("override_event_id", sa.Uuid(), sa.ForeignKey("event.id")),
        sa.Column("created_at", TZ, nullable=False, server_default=sa.func.now()),
        sa.Column("created_by", sa.Uuid(), sa.ForeignKey("user_account.id"), nullable=False),
        sa.Column("updated_at", TZ, nullable=False, server_default=sa.func.now()),
        sa.Column("deleted_at", TZ),
        sa.Column("delete_batch_id", sa.Uuid()),
        sa.Column("version", sa.BigInteger(), nullable=False, server_default="1"),
        sa.CheckConstraint("kind in ('cancelled', 'overridden')", name="ck_recurrence_exception_kind_valid"),
        sa.CheckConstraint(
            "(kind = 'overridden') = (override_event_id IS NOT NULL)",
            name="ck_recurrence_exception_override_matches_kind",
        ),
        sa.CheckConstraint(
            "container_kind = 'calendar'", name="ck_recurrence_exception_container_kind_valid"
        ),
    )
    op.create_index(
        "uq_recurrence_exception_active_date",
        "recurrence_exception",
        ["event_id", "occurrence_date"],
        unique=True,
        postgresql_where=sa.text("deleted_at IS NULL"),
    )

    for statement in (
        *content_child_policies("event"),
        *content_policies("recurrence_exception", "created_by"),
        *forbid_delete_triggers("event"),
        *forbid_delete_triggers("recurrence_exception"),
        *record_time_triggers("recurrence_exception", created_at=True, updated_at=True),
        audit_trigger("event", "ref"),
        audit_trigger("recurrence_exception", "ref"),
    ):
        op.execute(statement)


def downgrade() -> None:
    raise NotImplementedError("Migrations are forward-only (SRS 4.5); restore from backup to roll back.")
