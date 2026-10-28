"""Database side of reminders (FR-CAL-29, owner decision D-79).

+++===+++ 2026-10-28 — Hasan Alizada — HAAL-091.
- `reminder` is the user's own (owner-only row-level security), synced, soft-deleted. When it fires next lives in
  `reminder_schedule` (service data: not synced, not audited, never deleted), so the worker's bookkeeping never
  touches the reminder itself.
- A reminder written by its owner gets its schedule row (or has it marked) "to check". Changes that move the
  occurrences of other people's reminders — the event's times, its item deleted / restored / moved, an excluded date,
  access to the calendar granted or revoked — mark the reminders concerned as well. Those writers cannot see other
  users' reminders under row-level security, so SECURITY DEFINER functions (owned by the migration role) do it; they
  touch the schedule only.
- `haalendar_reminders_due(at, max)` (SECURITY DEFINER) gives the worker ids only — reminder and owner — of the rows to
  check or to fire; the worker then works as that owner, under row-level security.
Builders used by an applied migration are frozen.
"""

from __future__ import annotations

SCHEDULE_ON_WRITE_FUNCTION = """
CREATE OR REPLACE FUNCTION haalendar_reminder_schedule_touch() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public
AS $$
BEGIN
  INSERT INTO reminder_schedule (reminder_id, owner_id, needs_check) VALUES (NEW.id, NEW.owner_id, true)
  ON CONFLICT (reminder_id) DO UPDATE SET needs_check = true;
  RETURN NULL;
END
$$
"""

SCHEDULE_ON_WRITE_TRIGGER = (
    "CREATE TRIGGER haalendar_reminder_schedule_touch AFTER INSERT OR UPDATE ON reminder "
    "FOR EACH ROW EXECUTE FUNCTION haalendar_reminder_schedule_touch()"
)

RECHECK_ITEM_FUNCTION = """
CREATE OR REPLACE FUNCTION haalendar_reminders_recheck() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public
AS $$
DECLARE target uuid;
BEGIN
  IF TG_TABLE_NAME = 'share' THEN
    UPDATE reminder_schedule s SET needs_check = true
    FROM reminder r JOIN item i ON i.id = r.item_id
    WHERE s.reminder_id = r.id AND i.container_kind = NEW.container_kind AND i.container_id = NEW.container_id
      AND NOT s.needs_check;
    RETURN NULL;
  END IF;
  -- separate branches: PL/pgSQL resolves NEW.<field> at run time, and only exceptions have event_id
  IF TG_TABLE_NAME = 'recurrence_exception' THEN
    target := NEW.event_id;
  ELSE
    target := NEW.id;
  END IF;
  UPDATE reminder_schedule s SET needs_check = true
  FROM reminder r
  WHERE s.reminder_id = r.id AND r.item_id = target AND NOT s.needs_check;
  RETURN NULL;
END
$$
"""


def recheck_trigger(table: str) -> str:
    events = "INSERT OR UPDATE" if table in ("recurrence_exception", "share") else "UPDATE"
    return (
        f"CREATE TRIGGER haalendar_reminders_recheck AFTER {events} ON {table} "
        "FOR EACH ROW EXECUTE FUNCTION haalendar_reminders_recheck()"
    )


RECHECKED_TABLES: tuple[str, ...] = ("item", "event", "recurrence_exception", "share")

DUE_FUNCTION = """
CREATE OR REPLACE FUNCTION haalendar_reminders_due(at timestamptz, max_rows integer)
RETURNS TABLE (reminder_id uuid, owner_id uuid)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public
AS $$
  SELECT s.reminder_id, s.owner_id FROM reminder_schedule s JOIN reminder r ON r.id = s.reminder_id
  WHERE r.deleted_at IS NULL AND (s.needs_check OR s.next_fire_at <= at)
  ORDER BY s.needs_check DESC, s.next_fire_at
  LIMIT max_rows
$$
"""
