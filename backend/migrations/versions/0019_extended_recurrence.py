"""Extended recurrence (FR-CAL-30, C-06, owner decision D-80).

+++===+++ 2026-10-29 — Hasan Alizada — HAAL-092. Forward-only. The rule is no longer one of four fixed values: the
application checks it with calendar.recurrence.v2 (the subset of RRULE and that the start date is an occurrence); the
database keeps a shape check — parts of the supported names only — so nothing else can be stored by other means.
Existing series (FREQ=DAILY, WEEKLY, MONTHLY, YEARLY) pass both and keep their meaning.

Revision ID: 0019
Revises: 0018
"""

from collections.abc import Sequence

from alembic import op

revision: str = "0019"
down_revision: str | None = "0018"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

PART = "(FREQ|INTERVAL|BYDAY|BYMONTHDAY|UNTIL|COUNT)=[A-Z0-9,-]+"


def upgrade() -> None:
    op.drop_constraint("ck_event_rrule_supported", "event", type_="check")
    op.create_check_constraint(
        "ck_event_rrule_shape", "event", f"rrule IS NULL OR rrule ~ '^{PART}(;{PART})*$'"
    )


def downgrade() -> None:
    raise NotImplementedError("Migrations are forward-only (SRS 4.5); restore from backup to roll back.")
