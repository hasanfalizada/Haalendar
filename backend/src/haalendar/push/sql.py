"""Database side of Web Push (FR-CAL-29, owner decision D-79).

+++===+++ 2026-10-28 — Hasan Alizada — HAAL-091 (stage 2). A browser's push endpoint belongs to one person at a time:
when someone signs in on a shared browser and turns notifications on, the endpoint's active subscriptions of other
users are revoked (they would otherwise receive this person's reminders, or the reverse). Those rows are invisible to
the caller under row-level security, so a SECURITY DEFINER function revokes them (rows are kept, revoked_at set).
Builders used by an applied migration are frozen.
"""

from __future__ import annotations

CLAIM_ENDPOINT_FUNCTION = """
CREATE OR REPLACE FUNCTION haalendar_push_claim(target text) RETURNS integer
LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path = pg_catalog, public
AS $$
  WITH revoked AS (
    UPDATE push_subscription SET revoked_at = now(), revoke_reason = 'claimed'
    WHERE endpoint = target AND revoked_at IS NULL AND owner_id IS DISTINCT FROM haalendar_current_user_id()
    RETURNING 1
  )
  SELECT count(*)::integer FROM revoked
$$
"""
