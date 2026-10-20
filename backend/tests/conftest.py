"""Shared test fixtures.

+++===+++ 2026-10-14 — Hasan Alizada — HAAL-016. Settings are built from an explicit environment (never the
developer's real one). The database URL points to a closed port so readiness can be tested without PostgreSQL.
+++===+++ 2026-10-15 — Hasan Alizada — HAAL-160. Database-backed tests (marker `db`) use a throw-away database on the
server given by HAALENDAR_TEST_DATABASE_URL (a PostgreSQL 18 URL with rights to CREATE/DROP DATABASE). The database
is created and migrated once per test session and dropped afterwards. Without the variable the tests are skipped.
+++===+++ 2026-10-15 — Hasan Alizada — HAAL-165. Like production, the app under test connects as a least-privilege
application role (created by haalendar-db-bootstrap, granted by the migrations), so row-level security and the
missing DELETE privilege are exercised by every database test. Fixtures that clean up use the owner role.
"""

from __future__ import annotations

import os
import secrets
import tempfile
import uuid
from collections.abc import Iterator
from pathlib import Path

import psycopg
import pytest
from alembic import command
from alembic.config import Config
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy.engine import make_url

from haalendar.config import Settings, load_settings
from haalendar.db import ALEMBIC_INI
from haalendar.dbroles import bootstrap
from haalendar.main import create_app

UNREACHABLE_DB = "postgresql+psycopg://user:pw@127.0.0.1:1/none"
TEST_DB_ENV = "HAALENDAR_TEST_DATABASE_URL"


def make_settings(**overrides: str) -> Settings:
    env = {
        "HAALENDAR_ENV": "test",
        "HAALENDAR_DATABASE_URL": UNREACHABLE_DB,
        "HAALENDAR_DB_CONNECT_TIMEOUT_SECONDS": "1",
        "HAALENDAR_LOG_FORMAT": "json",
        # TestClient sends Host: testserver (HAAL-020 Host allow-list).
        "HAALENDAR_EXTRA_ALLOWED_HOSTS": "testserver",
        "HAALENDAR_RATE_LIMIT_PER_MINUTE": "0",
        "HAALENDAR_AUTH_RATE_LIMIT_PER_MINUTE": "0",
        # Production-mode tests need a storage directory (required there since HAAL-166).
        "HAALENDAR_STORAGE_DIR": str(Path(tempfile.gettempdir()) / "haalendar-test-storage"),
    }
    env.update({f"HAALENDAR_{k.upper()}": v for k, v in overrides.items()})
    return load_settings(env)


@pytest.fixture
def settings() -> Settings:
    return make_settings()


@pytest.fixture
def app(settings: Settings) -> FastAPI:
    return create_app(settings)


@pytest.fixture
def client(app: FastAPI) -> Iterator[TestClient]:
    # raise_server_exceptions=False: assert on the HTTP response a real client would receive.
    with TestClient(app, raise_server_exceptions=False) as test_client:
        yield test_client


def _libpq_url(sqlalchemy_url: str, database: str) -> str:
    url = make_url(sqlalchemy_url).set(drivername="postgresql", database=database)
    return url.render_as_string(hide_password=False)


@pytest.fixture(scope="session")
def owner_db_url() -> Iterator[str]:
    """Owner (migration) URL of a freshly created database; the app role is bootstrapped and the schema migrated.
    Database and role are dropped at the end of the session."""
    server_url = os.environ.get(TEST_DB_ENV)
    if not server_url:
        pytest.skip(f"{TEST_DB_ENV} is not set; database tests skipped")
    suffix = uuid.uuid4().hex[:12]
    name, role, password = f"haalendar_test_{suffix}", f"haalendar_app_{suffix}", secrets.token_urlsafe(18)
    admin_dsn = _libpq_url(server_url, "postgres")
    with psycopg.connect(admin_dsn, autocommit=True) as conn:
        conn.execute(f'CREATE DATABASE "{name}"')
    owner_url = make_url(server_url).set(database=name)
    app_url = owner_url.set(username=role, password=password)
    environment = {
        "HAALENDAR_MIGRATION_DATABASE_URL": owner_url.render_as_string(hide_password=False),
        "HAALENDAR_DATABASE_URL": app_url.render_as_string(hide_password=False),
    }
    previous = {key: os.environ.get(key) for key in environment}
    os.environ.update(environment)
    try:
        bootstrap(load_settings({**environment, "HAALENDAR_ENV": "test"}))
        command.upgrade(Config(str(ALEMBIC_INI)), "head")
        yield environment["HAALENDAR_MIGRATION_DATABASE_URL"]
    finally:
        for key, value in previous.items():
            if value is None:
                os.environ.pop(key, None)
            else:
                os.environ[key] = value
        with psycopg.connect(admin_dsn, autocommit=True) as conn:
            conn.execute(f'DROP DATABASE IF EXISTS "{name}" WITH (FORCE)')
            conn.execute(f'DROP ROLE IF EXISTS "{role}"')


@pytest.fixture(scope="session")
def db_url(owner_db_url: str) -> str:
    """Application-role URL of the test database (what the app under test uses)."""
    return os.environ["HAALENDAR_DATABASE_URL"]


@pytest.fixture
def clean_db(owner_db_url: str, db_url: str) -> Iterator[str]:
    """Empty account and planning tables and default instance settings before each database test (owner role:
    the application role cannot delete). Yields the application-role URL."""
    with psycopg.connect(
        _libpq_url(owner_db_url, make_url(owner_db_url).database or ""), autocommit=True
    ) as conn:
        # +++===+++ 2026-10-16 — Hasan Alizada — HAAL-030. The documented maintenance path: a superuser session with
        # replica replication role skips the no-delete triggers (throw-away test database only).
        conn.execute("SET session_replication_role = replica")
        conn.execute("TRUNCATE session, auth_token, recovery_code, share, calendar RESTART IDENTITY")
        # +++===+++ 2026-10-18 — Hasan Alizada — HAAL-043. Items, attachments, exports and queued jobs as well.
        conn.execute(
            "TRUNCATE attachment, item, export_request, procrastinate_events, procrastinate_jobs CASCADE"
        )
        conn.execute("TRUNCATE user_settings")  # +++===+++ 2026-10-19 — Hasan Alizada — HAAL-045.
        conn.execute("TRUNCATE notification")  # +++===+++ 2026-10-19 — Hasan Alizada — HAAL-048.
        conn.execute(
            "UPDATE instance_settings SET updated_by = NULL, registration_mode = 'invite', require_admin_2fa = false"
        )
        conn.execute("DELETE FROM user_account")
    yield db_url


@pytest.fixture
def mail_dir(tmp_path: Path) -> Path:
    return tmp_path / "mail"


@pytest.fixture
def api(clean_db: str, mail_dir: Path) -> Iterator[TestClient]:
    """App on a clean database; https base URL so the Secure __Host- session cookie round-trips (HAAL-160)."""
    app = create_app(make_settings(database_url=clean_db, mail_dir=str(mail_dir)))
    with TestClient(app, base_url="https://testserver", raise_server_exceptions=False) as test_client:
        yield test_client
