"""PostgreSQL row-level security for owner/share-filtered tables (ADR-0005 section 7, domain model section 7).

+++===+++ 2026-10-15 — Hasan Alizada — HAAL-165. Second layer behind the authz atom. Every request transaction carries
`app.user_id` (set_config(..., true) after the session is resolved); policies compare against it:
- containers (calendar, later board and note): read = owner or an active share; insert/update = owner only
  (rename, archive and soft-delete of a container are owner actions);
- shares: read = grantee or container owner; insert/update (grant, change, revoke) = container owner only, never to
  oneself;
- no DELETE policy exists (and the application role has no DELETE privilege): rows are never removed physically;
- without `app.user_id` (not signed in, admin endpoints, background code) no protected row is visible.
Helper functions are SECURITY DEFINER (owned by the migration role, which RLS does not restrict) with a fixed
search_path, so container and share policies can look at each other without recursion. They only answer questions
about the current user and never return another user's data.
Migrations call these builders; PROTECTED_TABLES lists every table that must be covered (checked by the test suite).
Builders used by an applied migration are frozen: a rule change needs new builders and a new migration, so a fresh
install and an upgraded one always end with the same policies.
"""

from __future__ import annotations

from typing import Literal

ContainerKind = Literal["calendar", "board", "note"]

# Table → protection pattern. A table with owner_id / container_id / grantee_id that is missing here fails the tests.
PROTECTED_TABLES: dict[str, Literal["container", "share", "audit", "content", "self"]] = {
    "calendar": "container",
    "share": "share",
    "audit_log": "audit",  # HAAL-032: haalendar.audit.sql.audit_read_policy
    "item": "content",  # HAAL-040: content_policies
    "attachment": "content",  # HAAL-040: content_policies
    "export_request": "self",  # HAAL-043: self_policies
    "user_settings": "self",  # HAAL-045: self_policies
    "notification": "self",  # HAAL-048: self_policies
    "sync_mutation": "self",  # HAAL-053: self_policies
}

CURRENT_USER_FUNCTION = """
CREATE OR REPLACE FUNCTION haalendar_current_user_id() RETURNS uuid
LANGUAGE sql STABLE PARALLEL SAFE
AS $$ SELECT nullif(current_setting('app.user_id', true), '')::uuid $$
"""

SHARE_PERMISSION_FUNCTION = """
CREATE OR REPLACE FUNCTION haalendar_share_permission(kind text, container uuid) RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public
AS $$
  SELECT s.permission FROM share s
  WHERE s.container_kind = kind AND s.container_id = container
    AND s.grantee_id = haalendar_current_user_id() AND s.revoked_at IS NULL
  LIMIT 1
$$
"""


def owns_container_function(container_tables: dict[ContainerKind, str]) -> str:
    """`haalendar_owns_container(kind, id)`: true when the current user owns that container. Re-created by each
    migration that adds a container table (board, note) with the complete kind → table map."""
    branches = "\n".join(
        f"    WHEN '{kind}' THEN RETURN EXISTS (SELECT 1 FROM {table} WHERE id = container AND owner_id = me);"  # noqa: S608 — kind/table are constants from migration code, never user input
        for kind, table in container_tables.items()
    )
    return f"""
CREATE OR REPLACE FUNCTION haalendar_owns_container(kind text, container uuid) RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog, public
AS $$
DECLARE me uuid := haalendar_current_user_id();
BEGIN
  IF me IS NULL THEN RETURN false; END IF;
  CASE kind
{branches}
    ELSE RETURN false;
  END CASE;
END
$$
"""


def container_policies(table: str, kind: ContainerKind) -> list[str]:
    me = "haalendar_current_user_id()"
    return [
        f"ALTER TABLE {table} ENABLE ROW LEVEL SECURITY",
        f"CREATE POLICY {table}_read ON {table} FOR SELECT "
        f"USING (owner_id = {me} OR haalendar_share_permission('{kind}', id) IS NOT NULL)",
        f"CREATE POLICY {table}_insert ON {table} FOR INSERT WITH CHECK (owner_id = {me})",
        f"CREATE POLICY {table}_update ON {table} FOR UPDATE USING (owner_id = {me}) WITH CHECK (owner_id = {me})",
    ]


def share_policies() -> list[str]:
    me = "haalendar_current_user_id()"
    owns = "haalendar_owns_container(container_kind, container_id)"
    return [
        "ALTER TABLE share ENABLE ROW LEVEL SECURITY",
        f"CREATE POLICY share_read ON share FOR SELECT USING (grantee_id = {me} OR {owns})",
        f"CREATE POLICY share_insert ON share FOR INSERT WITH CHECK ({owns} AND granted_by = {me} AND grantee_id <> {me})",
        f"CREATE POLICY share_update ON share FOR UPDATE USING ({owns}) WITH CHECK ({owns} AND grantee_id <> {me})",
    ]


# +++===+++ 2026-10-17 — Hasan Alizada — HAAL-040. Content rows (items and what hangs off them, e.g. attachments) carry
# container_kind / container_id: read = owner of the container or any active share; insert = owner or an edit share,
# and the row's author column must be the current user; update = owner or an edit share (soft delete, restore and
# edits included). Moving content to another container needs write access there too (WITH CHECK).
def content_policies(table: str, author_column: str) -> list[str]:
    me = "haalendar_current_user_id()"
    owns = "haalendar_owns_container(container_kind, container_id)"
    shared = "haalendar_share_permission(container_kind, container_id)"
    writable = f"({owns} OR {shared} = 'edit')"
    return [
        f"ALTER TABLE {table} ENABLE ROW LEVEL SECURITY",
        f"CREATE POLICY {table}_read ON {table} FOR SELECT USING ({owns} OR {shared} IS NOT NULL)",
        f"CREATE POLICY {table}_insert ON {table} FOR INSERT WITH CHECK ({writable} AND {author_column} = {me})",
        f"CREATE POLICY {table}_update ON {table} FOR UPDATE USING ({writable}) WITH CHECK ({writable})",
    ]


# +++===+++ 2026-10-18 — Hasan Alizada — HAAL-043. Rows that belong to one user only (e.g. their data exports): read,
# insert and update by the owner_id user; nobody else, administrators included.
def self_policies(table: str) -> list[str]:
    me = "haalendar_current_user_id()"
    return [
        f"ALTER TABLE {table} ENABLE ROW LEVEL SECURITY",
        f"CREATE POLICY {table}_read ON {table} FOR SELECT USING (owner_id = {me})",
        f"CREATE POLICY {table}_insert ON {table} FOR INSERT WITH CHECK (owner_id = {me})",
        f"CREATE POLICY {table}_update ON {table} FOR UPDATE USING (owner_id = {me}) WITH CHECK (owner_id = {me})",
    ]


# +++===+++ 2026-10-15 — Hasan Alizada — HAAL-167. A grantee may leave a shared container: the only change allowed to
# a grantee is revoking the own active share (permissive policies are OR-combined with share_update).
def share_leave_policy() -> list[str]:
    me = "haalendar_current_user_id()"
    return [
        f"CREATE POLICY share_leave ON share FOR UPDATE USING (grantee_id = {me} AND revoked_at IS NULL) "
        f"WITH CHECK (grantee_id = {me} AND revoked_at IS NOT NULL)",
    ]
