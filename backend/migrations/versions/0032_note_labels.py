"""Personal labels for notes (FR-TODO-04, domain model 5.11, owner decision D-109).

+++===+++ 2026-11-16 21:24 +04 — Hasan Alizada — HAAL-102. Forward-only.
- `label` without a board is a personal label: its container is its user (`user`, container_id = created_by). Name
  1-40, unique among the user's live personal labels (case ignored); board labels stay as they are.
- `item_label` may carry a user as container: a personal label on a note the user reads (their own or one shared with
  them); nobody else sees it.
- `haalendar_owns_container` and `haalendar_sync_audience` learn the container kind `user` (the user themself), so the
  content policies, pull and live updates of both tables work unchanged.

Revision ID: 0032
Revises: 0031
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

from haalendar.live.sql import AUDIENCE_FUNCTION_0032
from haalendar.security.rls import OWNS_CONTAINER_FUNCTION_0032

revision: str = "0032"
down_revision: str | None = "0031"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.alter_column("label", "board_id", existing_type=sa.Uuid(), nullable=True)
    op.alter_column("label", "container_kind", existing_type=sa.String(10), server_default=None)
    op.drop_constraint("ck_label_board_container", "label", type_="check")
    op.create_check_constraint(
        "ck_label_container",
        "label",
        "(board_id IS NOT NULL AND container_kind = 'board' AND container_id = board_id) "
        "OR (board_id IS NULL AND container_kind = 'user' AND container_id = created_by)",
    )
    op.create_index(
        "uq_label_name_per_user",
        "label",
        ["container_id", sa.text("lower(name)")],
        unique=True,
        postgresql_where=sa.text("board_id IS NULL AND deleted_at IS NULL"),
    )
    op.drop_constraint("ck_item_label_container_kind_valid", "item_label", type_="check")
    op.create_check_constraint(
        "ck_item_label_container_kind_valid", "item_label", "container_kind in ('board', 'user')"
    )
    op.execute(OWNS_CONTAINER_FUNCTION_0032)
    op.execute(AUDIENCE_FUNCTION_0032)


def downgrade() -> None:
    raise NotImplementedError("Migrations are forward-only (SRS 4.5); restore from backup to roll back.")
