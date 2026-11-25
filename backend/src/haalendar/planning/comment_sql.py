"""Database side of card comments (FR-KAN-05, owner decision D-123).

+++===+++ 2026-11-24 17:41 +04 — Hasan Alizada — HAAL-114. A new comment tells the card's assignees: an AFTER INSERT
trigger (SECURITY DEFINER, like the `assigned` notification of HAAL-119) writes a `comment` notification for every
live assignee except the author — card, board, who wrote; no text of the comment (a notification is never deleted, a
comment may be). A restored comment tells nobody.
Builders used by an applied migration are frozen.
"""

from __future__ import annotations

NOTIFY_COMMENT_FUNCTION = """
CREATE OR REPLACE FUNCTION haalendar_notify_comment() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public
AS $$
DECLARE
  card_title text;
  board_name text;
  by_name text;
BEGIN
  IF NEW.deleted_at IS NOT NULL THEN
    RETURN NULL;
  END IF;
  SELECT title INTO card_title FROM item WHERE id = NEW.item_id;
  SELECT name INTO board_name FROM board WHERE id = NEW.container_id;
  SELECT display_name INTO by_name FROM user_account WHERE id = NEW.author_id;
  INSERT INTO notification (id, owner_id, kind, item_id, payload)
  SELECT uuidv7(), a.user_id, 'comment', NEW.item_id, jsonb_build_object(
    'comment_id', NEW.id,
    'item_id', NEW.item_id,
    'title', card_title,
    'board_id', NEW.container_id,
    'board_name', board_name,
    'by_name', by_name)
  FROM card_assignee a
  WHERE a.item_id = NEW.item_id AND a.deleted_at IS NULL AND a.user_id <> NEW.author_id;
  RETURN NULL;
END
$$
"""

NOTIFY_COMMENT_TRIGGER = (
    "CREATE TRIGGER haalendar_notify_comment AFTER INSERT ON comment "
    "FOR EACH ROW EXECUTE FUNCTION haalendar_notify_comment()"
)
