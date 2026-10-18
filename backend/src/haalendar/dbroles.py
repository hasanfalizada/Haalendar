"""Database roles: the least-privilege application role and its table privileges (`haalendar-db-bootstrap`).

+++===+++ 2026-10-15 — Hasan Alizada — HAAL-165. ADR-0005 defense in depth, domain model P2/P9:
- the application connects as its own LOGIN role: NOSUPERUSER, NOBYPASSRLS, NOCREATEDB, NOCREATEROLE, so PostgreSQL
  row-level security applies to every query it runs;
- the role gets SELECT, INSERT, UPDATE on the tables and never DELETE or TRUNCATE: a physical delete is impossible at the
  database level (soft delete only, FR-X-01). Append-only tables get SELECT, INSERT; alembic_version is read-only;
- grants are applied table by table (no default privileges), so a table created by a migration is unreachable until
  the grants are refreshed — fail closed. Alembic refreshes them after every upgrade (migrations/env.py).
Role name and password come from HAALENDAR_DATABASE_URL; the owner connection from HAALENDAR_MIGRATION_DATABASE_URL.
"""

from __future__ import annotations

import re
import sys

import psycopg
from psycopg import sql
from sqlalchemy.engine import URL, make_url

from haalendar.config import Settings, load_settings
from haalendar.logging import configure_logging, get_logger

log = get_logger(__name__)

DEFAULT_TABLE_PRIVILEGES = ("SELECT", "INSERT", "UPDATE")
# Tables with narrower rights than the default (append-only audit tables join this map when they are created).
TABLE_PRIVILEGES: dict[str, tuple[str, ...]] = {
    "alembic_version": ("SELECT",),
    # HAAL-032: written only by SECURITY DEFINER triggers; the application can read (under RLS), never write.
    "audit_log": ("SELECT",),
    # +++===+++ 2026-10-18 — Hasan Alizada — HAAL-043 (D-48). Service data: the worker removes its own registration
    # (haalendar.security.no_delete.SERVICE_TABLES); user content never gets DELETE.
    "procrastinate_workers": ("SELECT", "INSERT", "UPDATE", "DELETE"),
}
ROLE_NAME = re.compile(r"^[a-z_][a-z0-9_]{0,62}$")


def _libpq(url: URL) -> str:
    return url.set(drivername="postgresql").render_as_string(hide_password=False)


def _roles(settings: Settings) -> tuple[URL, URL]:
    return make_url(settings.database_url.get_secret_value()), make_url(
        settings.migration_database_url.get_secret_value()
    )


def separate_roles(settings: Settings) -> bool:
    app, owner = _roles(settings)
    return bool(app.username) and app.username != owner.username


def _grant_tables(conn: psycopg.Connection, role: str) -> int:
    tables = [
        row[0]
        for row in conn.execute(
            "SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename"
        ).fetchall()
    ]
    ident = sql.Identifier(role)
    conn.execute(sql.SQL("GRANT USAGE ON SCHEMA public TO {}").format(ident))
    for table in tables:
        table_ident = sql.Identifier("public", table)
        privileges = TABLE_PRIVILEGES.get(table, DEFAULT_TABLE_PRIVILEGES)
        conn.execute(sql.SQL("REVOKE ALL ON TABLE {} FROM {}").format(table_ident, ident))
        conn.execute(
            sql.SQL("GRANT {} ON TABLE {} TO {}").format(
                sql.SQL(", ").join(sql.SQL(p) for p in privileges), table_ident, ident
            )
        )
    conn.execute(sql.SQL("GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO {}").format(ident))
    return len(tables)


def apply_app_grants(settings: Settings) -> None:
    """Refresh the application role's privileges (called after migrations). No-op in single-role setups."""
    if not separate_roles(settings):
        log.warning("db_grants_skipped_single_role")
        return
    app, owner = _roles(settings)
    role = app.username or ""
    with psycopg.connect(_libpq(owner), autocommit=True) as conn:
        exists = conn.execute("SELECT 1 FROM pg_roles WHERE rolname = %s", (role,)).fetchone()
        if exists is None:
            log.warning("db_grants_skipped_role_missing", role=role)
            return
        with conn.transaction():
            count = _grant_tables(conn, role)
    log.info("db_grants_applied", role=role, tables=count)


def bootstrap(settings: Settings) -> None:
    """Create or update the application role (LOGIN, no elevated attributes) and grant its privileges."""
    app, owner = _roles(settings)
    role = app.username or ""
    if not separate_roles(settings):
        message = "HAALENDAR_DATABASE_URL must use a different role than HAALENDAR_MIGRATION_DATABASE_URL"
        log.error("db_bootstrap_single_role")
        raise SystemExit(message)
    if not ROLE_NAME.match(role):
        raise SystemExit(f"Invalid application role name: {role!r}")
    if not app.password:
        raise SystemExit("HAALENDAR_DATABASE_URL must contain the application role password")
    attributes = sql.SQL(
        "LOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOREPLICATION PASSWORD {}"
    ).format(sql.Literal(app.password))
    with psycopg.connect(_libpq(owner), autocommit=True) as conn, conn.transaction():
        exists = conn.execute("SELECT 1 FROM pg_roles WHERE rolname = %s", (role,)).fetchone()
        verb = "ALTER" if exists else "CREATE"
        conn.execute(sql.SQL("{} ROLE {} WITH {}").format(sql.SQL(verb), sql.Identifier(role), attributes))
        database = conn.execute("SELECT current_database()").fetchone()
        assert database is not None
        conn.execute(
            sql.SQL("GRANT CONNECT ON DATABASE {} TO {}").format(
                sql.Identifier(database[0]), sql.Identifier(role)
            )
        )
        count = _grant_tables(conn, role)
    log.info("db_bootstrap_done", role=role, created=not exists, tables=count)


def main() -> None:
    settings = load_settings()
    configure_logging(settings)
    try:
        bootstrap(settings)
    except psycopg.Error as exc:
        log.error("db_bootstrap_failed", error_type=type(exc).__name__)
        sys.exit(1)


if __name__ == "__main__":
    main()
