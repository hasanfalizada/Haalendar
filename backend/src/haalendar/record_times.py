"""Record timestamps maintained by the database (FR-X-02): `updated_at` on every change, `created_at` never changes.

+++===+++ 2026-10-16 — Hasan Alizada — HAAL-031. Row-level BEFORE UPDATE triggers, so the values are right whatever
path changed the row (ORM, a Core update, a migration, psql):
- tables with `updated_at`: it becomes now() (transaction time) on every UPDATE — soft delete and restore included;
- tables with `created_at`: an UPDATE cannot change it (the old value is kept silently).
Every migration that creates a table calls record_time_triggers() with the columns it has; the test suite fails for a
table with one of these columns but without its trigger. Builders are frozen once used by an applied migration.
"""

from __future__ import annotations

TOUCH_UPDATED_AT_FUNCTION = """
CREATE OR REPLACE FUNCTION haalendar_touch_updated_at() RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END
$$
"""

KEEP_CREATED_AT_FUNCTION = """
CREATE OR REPLACE FUNCTION haalendar_keep_created_at() RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.created_at := OLD.created_at;
  RETURN NEW;
END
$$
"""


def record_time_triggers(table: str, *, created_at: bool, updated_at: bool) -> list[str]:
    statements: list[str] = []
    if created_at:
        statements.append(
            f"CREATE TRIGGER haalendar_keep_created_at BEFORE UPDATE ON {table} "
            "FOR EACH ROW EXECUTE FUNCTION haalendar_keep_created_at()"
        )
    if updated_at:
        statements.append(
            f"CREATE TRIGGER haalendar_touch_updated_at BEFORE UPDATE ON {table} "
            "FOR EACH ROW EXECUTE FUNCTION haalendar_touch_updated_at()"
        )
    return statements
