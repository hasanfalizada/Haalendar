"""Shared test fixtures.

+++===+++ 2026-10-14 — Hasan Alizada — HAAL-016. Settings are built from an explicit environment (never the
developer's real one). The database URL points to a closed port so readiness can be tested without PostgreSQL.
+++===+++ 2026-10-15 — Hasan Alizada — HAAL-160. Database-backed tests (marker `db`) use a throw-away database on the
server given by HAALENDAR_TEST_DATABASE_URL (a PostgreSQL 18 URL with rights to CREATE/DROP DATABASE). The database
is created and migrated once per test session and dropped afterwards. Without the variable the tests are skipped.
"""

from __future__ import annotations

import os
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
def db_url() -> Iterator[str]:
    """SQLAlchemy URL of a freshly created and migrated database; dropped at the end of the session."""
    server_url = os.environ.get(TEST_DB_ENV)
    if not server_url:
        pytest.skip(f"{TEST_DB_ENV} is not set; database tests skipped")
    name = f"haalendar_test_{uuid.uuid4().hex[:12]}"
    admin_dsn = _libpq_url(server_url, "postgres")
    with psycopg.connect(admin_dsn, autocommit=True) as conn:
        conn.execute(f'CREATE DATABASE "{name}"')
    url = make_url(server_url).set(database=name).render_as_string(hide_password=False)
    previous = os.environ.get("HAALENDAR_DATABASE_URL")
    os.environ["HAALENDAR_DATABASE_URL"] = url
    try:
        command.upgrade(Config(str(ALEMBIC_INI)), "head")
        yield url
    finally:
        if previous is None:
            os.environ.pop("HAALENDAR_DATABASE_URL", None)
        else:
            os.environ["HAALENDAR_DATABASE_URL"] = previous
        with psycopg.connect(admin_dsn, autocommit=True) as conn:
            conn.execute(f'DROP DATABASE IF EXISTS "{name}" WITH (FORCE)')


@pytest.fixture
def clean_db(db_url: str) -> Iterator[str]:
    """Empty account tables and default instance settings before each database test."""
    with psycopg.connect(_libpq_url(db_url, make_url(db_url).database or ""), autocommit=True) as conn:
        conn.execute("TRUNCATE session, auth_token RESTART IDENTITY")
        conn.execute("UPDATE instance_settings SET updated_by = NULL, registration_mode = 'invite'")
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
