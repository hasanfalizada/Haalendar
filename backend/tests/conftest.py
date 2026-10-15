"""Shared test fixtures.

+++===+++ 2026-10-14 — Hasan Alizada — HAAL-016. Settings are built from an explicit environment (never the
developer's real one). The database URL points to a closed port so readiness can be tested without PostgreSQL.
"""

from __future__ import annotations

from collections.abc import Iterator

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from haalendar.config import Settings, load_settings
from haalendar.main import create_app

UNREACHABLE_DB = "postgresql+psycopg://user:pw@127.0.0.1:1/none"


def make_settings(**overrides: str) -> Settings:
    env = {
        "HAALENDAR_ENV": "test",
        "HAALENDAR_DATABASE_URL": UNREACHABLE_DB,
        "HAALENDAR_DB_CONNECT_TIMEOUT_SECONDS": "1",
        "HAALENDAR_LOG_FORMAT": "json",
        # TestClient sends Host: testserver (HAAL-020 Host allow-list).
        "HAALENDAR_EXTRA_ALLOWED_HOSTS": "testserver",
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
