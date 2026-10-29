"""Database side of the sync (ADR-0009, D-56).

+++===+++ 2026-10-21 — Hasan Alizada — HAAL-053. Every syncable table carries `sync_seq` (from the one global sequence)
and `sync_xid` (the writing transaction), stamped by a BEFORE INSERT/UPDATE trigger, so no code path can forget them.
The function runs with the caller's rights (the application role has USAGE on the sequence). A table joins the sync by
being listed here and getting the trigger in a migration; the test suite checks that every listed table has it.
Builders used by an applied migration are frozen.
"""

from __future__ import annotations

# +++===+++ 2026-10-28 — Hasan Alizada — HAAL-091. The tables of migration 0014 stay frozen (that migration numbers them
# and builds its high-water function from them); a table joining later is added to SYNCED_TABLES and its migration
# re-creates the function with high_water_function(SYNCED_TABLES).
SYNCED_TABLES_0014: tuple[str, ...] = ("calendar", "share", "item", "attachment", "user_settings")
# +++===+++ 2026-10-29 — Hasan Alizada — HAAL-101. Checklist items join (migration 0023).
SYNCED_TABLES: tuple[str, ...] = (*SYNCED_TABLES_0014, "reminder", "checklist_item")

SYNC_STAMP_FUNCTION = """
CREATE OR REPLACE FUNCTION haalendar_sync_stamp() RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  -- The transaction id first: once a transaction holds a number it is already listed as "in progress" in every
  -- snapshot taken before it commits, so a pull can never hand out a later number and skip this one.
  NEW.sync_xid := pg_current_xact_id();
  NEW.sync_seq := nextval('sync_seq_global');
  RETURN NEW;
END
$$
"""


def sync_stamp_trigger(table: str) -> str:
    return (
        f"CREATE TRIGGER haalendar_sync_stamp BEFORE INSERT OR UPDATE ON {table} "
        "FOR EACH ROW EXECUTE FUNCTION haalendar_sync_stamp()"
    )


# The highest committed number over all synced tables, whatever the user may read (a number only, no data). Called in
# the pull statement (STABLE: same snapshot), it moves a cursor past rows the user cannot see — otherwise a user who
# sees nothing keeps cursor 0 and later receives everything twice when a container is shared with them.
def high_water_function(tables: tuple[str, ...]) -> str:
    return (
        "CREATE OR REPLACE FUNCTION haalendar_sync_high_water() RETURNS bigint "  # noqa: S608 — constant table names
        "LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public AS $$ SELECT GREATEST("
        + ", ".join(f"(SELECT coalesce(max(sync_seq), 0) FROM {table})" for table in tables)  # noqa: S608
        + ") $$"
    )


SYNC_HIGH_WATER_FUNCTION = high_water_function(SYNCED_TABLES_0014)
