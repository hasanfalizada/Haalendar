"""Audit log written by the database (FR-X-03, domain model 5.18, owner decision D-37).

+++===+++ 2026-10-16 — Hasan Alizada — HAAL-032. An AFTER INSERT/UPDATE trigger on every audited table writes one
audit_log row per change. The trigger function is SECURITY DEFINER (owned by the migration role), so the application
role has no INSERT privilege on audit_log at all: code can neither forge nor skip a record.
- actor = app.user_id, request id = app.request_id of the transaction (both set per request);
- action: insert → create (share: share); deleted_at set → delete, cleared → restore; revoked_at set → unshare;
  container / calendar / column / board / position changed → move; anything else → update;
- snapshots: full row on create; otherwise only the changed fields in before/after. Technical columns (updated_at,
  updated_by, version, sync_seq) never count as a change, and secret or noisy columns given per table are left out;
- audit_log itself refuses UPDATE (and DELETE/TRUNCATE, haalendar.security.no_delete) for every role.
Container mode per table: "self:<kind>" (the row is a container), "ref" (container_kind/container_id columns),
"none", "singleton" (one-row tables; entity id = the nil UUID). Builders are frozen once used by an applied migration.
"""

from __future__ import annotations

from typing import Literal

SINGLETON_ID = "00000000-0000-0000-0000-000000000000"

# Every table is either audited (mode, excluded columns) or explicitly exempt — the test suite checks both lists.
USER_ACCOUNT_EXCLUDED = (
    "password_hash",
    "totp_secret_enc",
    "totp_pending_secret_enc",
    "totp_last_step",
    "failed_login_count",
    "last_login_at",
)
AUDITED_TABLES: dict[str, tuple[str, tuple[str, ...]]] = {
    "user_account": ("none", USER_ACCOUNT_EXCLUDED),
    "instance_settings": ("singleton", ()),
    "calendar": ("self:calendar", ()),
    "share": ("ref", ()),
    # +++===+++ 2026-10-17 — Hasan Alizada — HAAL-040. Items and attachments (storage keys are internal).
    "item": ("ref", ()),
    "attachment": ("ref", ("storage_key", "thumbnail_key")),
}
# Sessions, tokens and recovery codes are numerous and secret (structured logs cover them); the log itself and
# alembic's bookkeeping are not audited either.
AUDIT_EXEMPT_TABLES = frozenset({"session", "auth_token", "recovery_code", "audit_log", "alembic_version"})
NOISE_COLUMNS = ("updated_at", "updated_by", "version", "sync_seq")

AUDIT_FUNCTION = f"""
CREATE OR REPLACE FUNCTION haalendar_audit() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public
AS $$
DECLARE
  mode text := TG_ARGV[0];
  excluded text[] := TG_ARGV[1:];
  noise text[] := ARRAY{list(NOISE_COLUMNS)!r}::text[];
  new_j jsonb := to_jsonb(NEW) - excluded;
  old_j jsonb;
  before_j jsonb := NULL;
  after_j jsonb;
  act text;
  k text;
  c_kind text := NULL;
  c_id uuid := NULL;
  e_id uuid;
BEGIN
  IF TG_OP = 'INSERT' THEN
    act := CASE WHEN TG_TABLE_NAME = 'share' THEN 'share' ELSE 'create' END;
    after_j := new_j;
  ELSE
    old_j := to_jsonb(OLD) - excluded;
    before_j := '{{}}'::jsonb;
    after_j := '{{}}'::jsonb;
    FOR k IN SELECT jsonb_object_keys(new_j) LOOP
      IF NOT (k = ANY(noise)) AND (new_j -> k) IS DISTINCT FROM (old_j -> k) THEN
        before_j := before_j || jsonb_build_object(k, old_j -> k);
        after_j := after_j || jsonb_build_object(k, new_j -> k);
      END IF;
    END LOOP;
    IF after_j = '{{}}'::jsonb THEN
      RETURN NULL;  -- only technical or excluded columns changed
    END IF;
    act := CASE
      WHEN after_j ? 'deleted_at' AND old_j ->> 'deleted_at' IS NULL THEN 'delete'
      WHEN after_j ? 'deleted_at' AND new_j ->> 'deleted_at' IS NULL THEN 'restore'
      WHEN after_j ? 'revoked_at' AND new_j ->> 'revoked_at' IS NOT NULL THEN 'unshare'
      WHEN after_j ?| ARRAY['container_id', 'calendar_id', 'column_id', 'board_id', 'position'] THEN 'move'
      ELSE 'update'
    END;
  END IF;

  IF mode = 'singleton' THEN
    e_id := '{SINGLETON_ID}'::uuid;
  ELSE
    e_id := (to_jsonb(NEW) ->> 'id')::uuid;
  END IF;
  IF mode LIKE 'self:%' THEN
    c_kind := substr(mode, 6);
    c_id := e_id;
  ELSIF mode = 'ref' THEN
    c_kind := to_jsonb(NEW) ->> 'container_kind';
    c_id := (to_jsonb(NEW) ->> 'container_id')::uuid;
  END IF;

  INSERT INTO audit_log (actor_id, action, entity_type, entity_id, container_kind, container_id, before, after,
                         request_id)
  VALUES (nullif(current_setting('app.user_id', true), '')::uuid, act, TG_TABLE_NAME, e_id, c_kind, c_id,
          before_j, after_j, nullif(current_setting('app.request_id', true), ''));
  RETURN NULL;
END
$$
"""  # noqa: S608 — DDL built from module constants (column names, nil UUID), never from user input

FORBID_UPDATE_FUNCTION = """
CREATE OR REPLACE FUNCTION haalendar_forbid_update() RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'Table % is append-only', TG_TABLE_NAME USING ERRCODE = 'restrict_violation';
END
$$
"""

Mode = Literal["none", "ref", "singleton"] | str


def audit_trigger(table: str, mode: Mode, excluded: tuple[str, ...] = ()) -> str:
    """AFTER INSERT/UPDATE audit trigger; `excluded` columns never appear in snapshots (secrets, noise)."""
    arguments = ", ".join(f"'{value}'" for value in (mode, *excluded))
    return (
        f"CREATE TRIGGER haalendar_audit AFTER INSERT OR UPDATE ON {table} "
        f"FOR EACH ROW EXECUTE FUNCTION haalendar_audit({arguments})"
    )


def append_only_trigger(table: str) -> str:
    return (
        f"CREATE TRIGGER haalendar_append_only BEFORE UPDATE ON {table} "
        "FOR EACH STATEMENT EXECUTE FUNCTION haalendar_forbid_update()"
    )


def audit_read_policy() -> list[str]:
    """Who may read audit records: content history for the container's owner and grantees (share history for the
    owner only); account history for the account itself and for active administrators."""
    me = "haalendar_current_user_id()"
    readable_container = (
        "(haalendar_owns_container(container_kind, container_id) "
        "OR haalendar_share_permission(container_kind, container_id) IS NOT NULL)"
    )
    return [
        "ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY",
        f"""
CREATE OR REPLACE FUNCTION haalendar_is_admin() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public
AS $$ SELECT EXISTS (SELECT 1 FROM user_account WHERE id = {me} AND role = 'admin' AND deactivated_at IS NULL) $$
""",  # noqa: S608 — DDL built from a constant function name, never from user input
        "CREATE POLICY audit_log_read ON audit_log FOR SELECT USING ("
        f"(entity_type = 'share' AND haalendar_owns_container(container_kind, container_id)) "
        f"OR (entity_type <> 'share' AND container_id IS NOT NULL AND {readable_container}) "
        f"OR (container_id IS NULL AND (entity_id = {me} OR haalendar_is_admin())))",
    ]
