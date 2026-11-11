"""Baseline: empty schema marker.

+++===+++ 2026-10-14 — Hasan Alizada — HAAL-016. First revision so that readiness can verify "migrations at head".
Domain tables are added by HAAL-030 and later tasks. Forward-only: downgrade is not supported.

Revision ID: 0001
Revises:
"""

from collections.abc import Sequence

revision: str = "0001"
down_revision: str | None = None
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    raise NotImplementedError("Migrations are forward-only (SRS 4.5); restore from backup to roll back.")
