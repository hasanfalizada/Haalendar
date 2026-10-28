"""Web Push (FR-CAL-29, domain model 5.17 push_subscription, owner decision D-79).

+++===+++ 2026-10-28 — Hasan Alizada — HAAL-091 (stage 2). Forward-only.
- `push_key`: the instance's VAPID key pair (one row), made on first use; the private key encrypted with the secret
  key (AES-256-GCM as the 2FA secrets). Service data: not audited (a secret), never deleted.
- `push_subscription`: one browser of one user (endpoint and keys from the browser). Owner-only row-level security;
  revoked (revoked_at with a reason: by the user, at sign-out, gone at the push service, claimed by another user on the
  same browser), never deleted; not audited (device data, like sessions). One active row per endpoint and user.
- haalendar_push_claim(endpoint): revokes the endpoint's active subscriptions of other users (haalendar.push.sql).

Revision ID: 0018
Revises: 0017
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

from haalendar.push.sql import CLAIM_ENDPOINT_FUNCTION
from haalendar.record_times import record_time_triggers
from haalendar.security.no_delete import forbid_delete_triggers
from haalendar.security.rls import self_policies

revision: str = "0018"
down_revision: str | None = "0017"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

TZ = sa.DateTime(timezone=True)


def upgrade() -> None:
    op.create_table(
        "push_key",
        sa.Column("id", sa.SmallInteger(), primary_key=True),
        sa.Column("public_key", sa.String(100), nullable=False),
        sa.Column("private_key_enc", sa.Text(), nullable=False),
        sa.Column("created_at", TZ, nullable=False, server_default=sa.func.now()),
        sa.CheckConstraint("id = 1", name="ck_push_key_single_row"),
    )
    op.create_table(
        "push_subscription",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("owner_id", sa.Uuid(), sa.ForeignKey("user_account.id"), nullable=False),
        sa.Column("endpoint", sa.String(2048), nullable=False),
        sa.Column("p256dh", sa.String(200), nullable=False),
        sa.Column("auth", sa.String(100), nullable=False),
        sa.Column("user_agent", sa.String(200)),
        sa.Column("created_at", TZ, nullable=False, server_default=sa.func.now()),
        sa.Column("last_sent_at", TZ),
        sa.Column("revoked_at", TZ),
        sa.Column("revoke_reason", sa.String(20)),
        sa.CheckConstraint(
            "revoke_reason IS NULL OR revoke_reason in ('user', 'sign_out', 'gone', 'claimed')",
            name="ck_push_subscription_revoke_reason_valid",
        ),
        sa.CheckConstraint(
            "(revoked_at IS NULL) = (revoke_reason IS NULL)", name="ck_push_subscription_revoked_with_reason"
        ),
    )
    op.create_index(
        "uq_push_subscription_active_endpoint",
        "push_subscription",
        ["owner_id", "endpoint"],
        unique=True,
        postgresql_where=sa.text("revoked_at IS NULL"),
    )
    op.create_index("ix_push_subscription_endpoint", "push_subscription", ["endpoint"])
    for statement in (
        *self_policies("push_subscription"),
        *forbid_delete_triggers("push_key"),
        *forbid_delete_triggers("push_subscription"),
        *record_time_triggers("push_key", created_at=True, updated_at=False),
        *record_time_triggers("push_subscription", created_at=True, updated_at=False),
        CLAIM_ENDPOINT_FUNCTION,
    ):
        op.execute(statement)


def downgrade() -> None:
    raise NotImplementedError("Migrations are forward-only (SRS 4.5); restore from backup to roll back.")
