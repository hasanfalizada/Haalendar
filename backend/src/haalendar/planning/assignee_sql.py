"""Database side of card assignees (FR-KAN-10, owner decision D-97).

+++===+++ 2026-10-30 — Hasan Alizada — HAAL-119.
- `haalendar_board_members(board)` (SECURITY DEFINER): the board's owner and everyone with an active share (with the
  permission: owner, edit or view) — for whoever reads the board only (nothing otherwise). A grantee cannot read other
  people's shares under row-level security, yet needs the members to see and choose assignees.
- An assignment written by someone else tells the assignee: an AFTER INSERT trigger (SECURITY DEFINER, like the share
  notifications of HAAL-048) writes an `assigned` notification — card, board, who assigned. Assigning oneself and
  restoring a removed assignment tell nobody.
Builders used by an applied migration are frozen.
"""

from __future__ import annotations

MEMBERS_FUNCTION = """
CREATE OR REPLACE FUNCTION haalendar_board_members(board uuid) RETURNS TABLE (user_id uuid, permission text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public
AS $$
  WITH readable AS (
    SELECT b.id, b.owner_id FROM board b
    WHERE b.id = $1 AND b.deleted_at IS NULL
      AND (b.owner_id = haalendar_current_user_id() OR haalendar_share_permission('board', $1) IS NOT NULL)
  )
  SELECT r.owner_id, 'owner' FROM readable r
  UNION ALL
  SELECT s.grantee_id, s.permission FROM share s JOIN readable r ON r.id = s.container_id
  WHERE s.container_kind = 'board' AND s.revoked_at IS NULL
$$
"""

NOTIFY_ASSIGNED_FUNCTION = """
CREATE OR REPLACE FUNCTION haalendar_notify_assigned() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public
AS $$
DECLARE
  actor uuid := coalesce(haalendar_current_user_id(), NEW.created_by);
  card_title text;
  board_name text;
  by_name text;
BEGIN
  IF NEW.user_id = actor OR NEW.deleted_at IS NOT NULL THEN
    RETURN NULL;
  END IF;
  SELECT title INTO card_title FROM item WHERE id = NEW.item_id;
  SELECT name INTO board_name FROM board WHERE id = NEW.container_id;
  SELECT display_name INTO by_name FROM user_account WHERE id = actor;
  INSERT INTO notification (id, owner_id, kind, item_id, payload)
  VALUES (uuidv7(), NEW.user_id, 'assigned', NEW.item_id, jsonb_build_object(
    'card_assignee_id', NEW.id,
    'item_id', NEW.item_id,
    'title', card_title,
    'board_id', NEW.container_id,
    'board_name', board_name,
    'by_name', by_name));
  RETURN NULL;
END
$$
"""

NOTIFY_ASSIGNED_TRIGGER = (
    "CREATE TRIGGER haalendar_notify_assigned AFTER INSERT ON card_assignee "
    "FOR EACH ROW EXECUTE FUNCTION haalendar_notify_assigned()"
)
