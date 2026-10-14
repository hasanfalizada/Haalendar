"""Health probes (contract: healthLive, healthReady).

+++===+++ 2026-10-14 — Hasan Alizada — HAAL-016.
"""

from __future__ import annotations

from fastapi.testclient import TestClient

from haalendar import __version__
from haalendar.db import migration_head


def test_live_returns_ok_and_version(client: TestClient) -> None:
    response = client.get("/api/v1/health/live")
    assert response.status_code == 200
    assert response.json() == {"status": "ok", "version": __version__}


def test_ready_reports_unreachable_database_as_503(client: TestClient) -> None:
    response = client.get("/api/v1/health/ready")
    assert response.status_code == 503
    body = response.json()
    assert body["status"] == "not_ready"
    assert body["checks"]["database"] is False
    assert body["checks"]["migrations"] is False
    assert body["checks"]["expected_revision"] == migration_head()
    # No internal error text or connection string is exposed.
    assert "postgresql" not in response.text
    assert "pw@" not in response.text


def test_migration_head_is_baseline() -> None:
    assert migration_head() == "0001"
