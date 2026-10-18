"""Database-level ban on physical deletes (FR-X-01, domain model P2/P10) — the last line of defence.

+++===+++ 2026-10-16 — Hasan Alizada — HAAL-030. Every table except alembic_version carries statement-level
BEFORE DELETE and BEFORE TRUNCATE triggers that raise. They stop deletes by any role, including the owner and a
superuser typing in psql. The application role additionally has no DELETE/TRUNCATE privilege (HAAL-165).
Deliberate maintenance (throw-away test databases; later the demo reset or an approved erasure procedure) runs as a
superuser with `SET session_replication_role = replica`, which skips these triggers for that session only.
Every migration that creates a table calls forbid_delete_triggers(); the test suite fails for a table without them.
Builders are frozen once used by an applied migration (same rule as haalendar.security.rls).
+++===+++ 2026-10-18 — Hasan Alizada — HAAL-043 (owner decision D-48). The ban protects user content and its
metadata. Service data may be removed: SERVICE_TABLES lists every such table with the reason, and the test suite
fails for any other table without the triggers. Today only the job queue's worker registry, which Procrastinate
cleans up itself when a worker stops or stops responding.
"""

from __future__ import annotations

# Service tables whose rows may be physically removed (never user content or its metadata), with the reason.
SERVICE_TABLES: dict[str, str] = {
    "procrastinate_workers": "job queue worker registry: removed by Procrastinate on shutdown or missed heartbeats",
}
EXEMPT_TABLES = frozenset({"alembic_version", *SERVICE_TABLES})

FORBID_DELETE_FUNCTION = """
CREATE OR REPLACE FUNCTION haalendar_forbid_delete() RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'Physical % on table % is forbidden: Haalendar uses soft delete only', TG_OP, TG_TABLE_NAME
    USING ERRCODE = 'restrict_violation',
          HINT = 'Set deleted_at / revoked_at instead. Maintenance: superuser with session_replication_role = replica.';
END
$$
"""


def forbid_delete_triggers(table: str) -> list[str]:
    return [
        f"CREATE TRIGGER haalendar_no_delete BEFORE DELETE ON {table} "
        "FOR EACH STATEMENT EXECUTE FUNCTION haalendar_forbid_delete()",
        f"CREATE TRIGGER haalendar_no_truncate BEFORE TRUNCATE ON {table} "  # physical-delete-allowed: the guard itself
        "FOR EACH STATEMENT EXECUTE FUNCTION haalendar_forbid_delete()",
    ]
