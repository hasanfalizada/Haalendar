"""Converting an item to another kind in place (FR-INT-02, owner decision D-125).

+++===+++ 2026-11-25 13:10 +04 — Hasan Alizada — HAAL-122. Forward-only.
- `item_update` lets the new row of an update be the user's own note that is its own container (an event or a card of
  the user becoming a note; the container lookup still sees the earlier kind while the row is checked).
- `haalendar_owns_container('note', id)`: the owner owns a note container also while the item is another kind and its
  note details are kept, so they are found again when it becomes a note once more.

Revision ID: 0039
Revises: 0038
"""

from collections.abc import Sequence

from alembic import op

from haalendar.security.rls import OWNS_CONTAINER_FUNCTION_0039, item_update_policy_0039

revision: str = "0039"
down_revision: str | None = "0038"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.execute(OWNS_CONTAINER_FUNCTION_0039)
    for statement in item_update_policy_0039():
        op.execute(statement)


def downgrade() -> None:
    raise NotImplementedError("Migrations are forward-only (SRS 4.5); restore from backup to roll back.")
