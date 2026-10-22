"""SQL for live updates (ADR-0009, D-59).

+++===+++ 2026-10-22 — Hasan Alizada — HAAL-055.
- An AFTER INSERT/UPDATE trigger on every synced table and on `notification` sends `pg_notify` on one channel. The
  message is delivered only when the transaction commits (nothing uncommitted leaks) and PostgreSQL merges identical
  messages of one transaction (deleting a calendar with all its items is one message). It names whom to tell, never the
  data: a container (kind + id) and/or user ids, plus the event (`changes` or `notification`).
- `haalendar_sync_audience(kind, id)` (SECURITY DEFINER, user ids only): the owner of a container and everyone it is
  shared with right now. Re-created by each migration that adds a container table (board, note).
"""

from __future__ import annotations

from haalendar.security.rls import ContainerKind

CHANNEL = "haalendar_sync"
NOTIFIED_TABLES: tuple[str, ...] = (
    "calendar",
    "share",
    "item",
    "attachment",
    "user_settings",
    "notification",
)

NOTIFY_FUNCTION = f"""
CREATE OR REPLACE FUNCTION haalendar_sync_notify() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, public
AS $$
DECLARE message jsonb;
BEGIN
  CASE TG_TABLE_NAME
    WHEN 'calendar' THEN message := jsonb_build_object('c', 'calendar', 'i', NEW.id);
    WHEN 'item', 'attachment' THEN message := jsonb_build_object('c', NEW.container_kind, 'i', NEW.container_id);
    -- the grantee is told directly as well: a revoked share must reach the person who lost access
    WHEN 'share' THEN message := jsonb_build_object(
      'c', NEW.container_kind, 'i', NEW.container_id, 'u', jsonb_build_array(NEW.grantee_id, NEW.granted_by));
    WHEN 'user_settings' THEN message := jsonb_build_object('u', jsonb_build_array(NEW.owner_id));
    WHEN 'notification' THEN message := jsonb_build_object('e', 'notification', 'u', jsonb_build_array(NEW.owner_id));
    ELSE RETURN NULL;
  END CASE;
  PERFORM pg_notify('{CHANNEL}', message::text);
  RETURN NULL;
END
$$
"""


def notify_trigger(table: str) -> str:
    return (
        f"CREATE TRIGGER trg_{table}_sync_notify AFTER INSERT OR UPDATE ON {table} "
        "FOR EACH ROW EXECUTE FUNCTION haalendar_sync_notify()"
    )


def audience_function(container_tables: dict[ContainerKind, str]) -> str:
    owners = "\n  UNION\n".join(
        f"  SELECT owner_id FROM {table} WHERE kind = '{kind}' AND id = container"  # noqa: S608 — constants from migration code
        for kind, table in container_tables.items()
    )
    return f"""
CREATE OR REPLACE FUNCTION haalendar_sync_audience(kind text, container uuid) RETURNS SETOF uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public
AS $$
{owners}
  UNION
  SELECT grantee_id FROM share WHERE container_kind = kind AND container_id = container AND revoked_at IS NULL
$$
"""  # noqa: S608 — kinds and tables are constants from migration code
