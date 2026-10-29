"""Notes (FR-TODO-01, FR-TODO-03, domain model 5.7, owner decisions D-87).

+++===+++ 2026-10-29 — Hasan Alizada — HAAL-100. Forward-only.
- `note`: the note details of an item of kind `note` (1:1, same id). A note is its own container: container_kind
  `note`, container_id = its id (copied from the item like on `event`, for row-level security and the audit log).
  Pinned, archived (archive ≠ delete), position (fractional index, lexicographic order), due date and checklist mode
  (used by HAAL-101/104). No physical delete, audited; written together with its item, so the item's version and sync
  number move with every change (pull sends the note fields with the item).
- `haalendar_owns_container` and `haalendar_sync_audience` learn the container kind `note` (its owner: the item's).
- `item` read / insert policies also let the owner write a note that is its own container (it cannot be found as a
  container while it is being inserted).

Revision ID: 0022
Revises: 0021
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

from haalendar.audit.sql import audit_trigger
from haalendar.live.sql import AUDIENCE_FUNCTION_0022
from haalendar.security.no_delete import forbid_delete_triggers
from haalendar.security.rls import OWNS_CONTAINER_FUNCTION_0022, content_child_policies, item_policies_0022

revision: str = "0022"
down_revision: str | None = "0021"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

TZ = sa.DateTime(timezone=True)


def upgrade() -> None:
    op.create_table(
        "note",
        sa.Column("id", sa.Uuid(), sa.ForeignKey("item.id"), primary_key=True),
        sa.Column("container_kind", sa.String(10), nullable=False),
        sa.Column("container_id", sa.Uuid(), nullable=False),
        sa.Column("pinned", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("archived_at", TZ),
        sa.Column("position", sa.String(64), nullable=False),
        sa.Column("due_at", TZ),
        sa.Column("is_checklist", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.CheckConstraint("container_kind = 'note' AND container_id = id", name="ck_note_own_container"),
        sa.CheckConstraint("position ~ '^[0-9A-Za-z]{1,64}$'", name="ck_note_position_valid"),
    )
    for statement in (
        OWNS_CONTAINER_FUNCTION_0022,
        AUDIENCE_FUNCTION_0022,
        *item_policies_0022(),
        *content_child_policies("note"),
        *forbid_delete_triggers("note"),
        audit_trigger("note", "ref"),
    ):
        op.execute(statement)


def downgrade() -> None:
    raise NotImplementedError("Migrations are forward-only (SRS 4.5); restore from backup to roll back.")
