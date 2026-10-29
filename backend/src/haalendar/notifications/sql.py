"""Notifications written by the database (FR-X-21, owner decision D-52).

+++===+++ 2026-10-19 — Hasan Alizada — HAAL-048. A notification for another user (a share granted to Bob by Ada) cannot
be inserted by Ada's request under row-level security, so the share table carries an AFTER trigger whose SECURITY
DEFINER function (owned by the migration role) writes it:
- share inserted → `share_received` for the grantee;
- revoked_at set by the owner → `share_revoked` for the grantee; a grantee who leaves gets nothing;
- payload: share id, container kind / id / name, who did it (display name) and the permission — display data only.
A guard trigger lets the owner change nothing on a notification but its read and push-delivery times.
Builders used by an applied migration are frozen.
"""

from __future__ import annotations

KINDS = ("reminder", "share_received", "share_revoked", "sync_error", "assigned", "comment", "export_ready")

NOTIFY_SHARE_FUNCTION = """
CREATE OR REPLACE FUNCTION haalendar_notify_share() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public
AS $$
DECLARE
  actor uuid := haalendar_current_user_id();
  note_kind text;
  c_name text := NULL;
  by_name text;
BEGIN
  IF TG_OP = 'INSERT' THEN
    note_kind := 'share_received';
  ELSIF OLD.revoked_at IS NULL AND NEW.revoked_at IS NOT NULL THEN
    IF actor = NEW.grantee_id THEN
      RETURN NULL;  -- the grantee left the share: nothing to tell them
    END IF;
    note_kind := 'share_revoked';
  ELSE
    RETURN NULL;
  END IF;
  IF NEW.container_kind = 'calendar' THEN
    SELECT name INTO c_name FROM calendar WHERE id = NEW.container_id;
  END IF;
  SELECT display_name INTO by_name FROM user_account WHERE id = coalesce(actor, NEW.granted_by);
  INSERT INTO notification (id, owner_id, kind, payload)
  VALUES (uuidv7(), NEW.grantee_id, note_kind, jsonb_build_object(
    'share_id', NEW.id,
    'container_kind', NEW.container_kind,
    'container_id', NEW.container_id,
    'container_name', c_name,
    'by_name', by_name,
    'permission', NEW.permission));
  RETURN NULL;
END
$$
"""

NOTIFY_SHARE_TRIGGER = (
    "CREATE TRIGGER haalendar_notify_share AFTER INSERT OR UPDATE OF revoked_at ON share "
    "FOR EACH ROW EXECUTE FUNCTION haalendar_notify_share()"
)

# +++===+++ 2026-10-29 — Hasan Alizada — HAAL-110 (migration 0025). A shared board is named in the notification too.
NOTIFY_SHARE_FUNCTION_0025 = NOTIFY_SHARE_FUNCTION.replace(
    "    SELECT name INTO c_name FROM calendar WHERE id = NEW.container_id;\n  END IF;",
    "    SELECT name INTO c_name FROM calendar WHERE id = NEW.container_id;\n"
    "  ELSIF NEW.container_kind = 'board' THEN\n"
    "    SELECT name INTO c_name FROM board WHERE id = NEW.container_id;\n  END IF;",
)

ONLY_READ_STATE_FUNCTION = """
CREATE OR REPLACE FUNCTION haalendar_notification_read_only() RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF (to_jsonb(NEW) - 'read_at' - 'delivered_push_at') <> (to_jsonb(OLD) - 'read_at' - 'delivered_push_at') THEN
    RAISE EXCEPTION 'only read_at and delivered_push_at of a notification may change' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END
$$
"""

ONLY_READ_STATE_TRIGGER = (
    "CREATE TRIGGER haalendar_notification_read_only BEFORE UPDATE ON notification "
    "FOR EACH ROW EXECUTE FUNCTION haalendar_notification_read_only()"
)
