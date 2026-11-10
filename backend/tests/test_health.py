"""Health probes (contract: healthLive, healthReady).

+++===+++ 2026-10-14 — Hasan Alizada — HAAL-016.
"""

from __future__ import annotations

import importlib
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

import haalendar
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


def test_migration_head_is_latest() -> None:
    # +++===+++ 2026-10-28 — Hasan Alizada — HAAL-091: reminders (0017), Web Push (0018).
    # +++===+++ 2026-10-29 — Hasan Alizada — HAAL-092: extended recurrence (0019).
    # +++===+++ 2026-10-29 — Hasan Alizada — HAAL-100: notes (0022).
    # +++===+++ 2026-10-29 — Hasan Alizada — HAAL-101: checklist items (0023).
    # +++===+++ 2026-10-29 — Hasan Alizada — HAAL-105: reminders on notes (0024).
    # +++===+++ 2026-10-29 — Hasan Alizada — HAAL-110: Kanban boards (0025).
    # +++===+++ 2026-10-29 — Hasan Alizada — HAAL-111: board columns (0026).
    # +++===+++ 2026-10-29 — Hasan Alizada — HAAL-112: cards and labels (0027).
    # +++===+++ 2026-10-30 — Hasan Alizada — HAAL-116: reminders on cards (0028).
    # +++===+++ 2026-10-30 — Hasan Alizada — HAAL-119: card assignees (0029).
    # +++===+++ 2026-10-30 — Hasan Alizada — HAAL-120: links (0030).
    # +++===+++ 2026-11-07 — Hasan Alizada — HAAL-145 (F7): shared notes named in the notification (0031).
    assert migration_head() == "0031"


def test_the_version_of_an_image_is_the_version_of_its_release(monkeypatch: pytest.MonkeyPatch) -> None:
    """+++===+++ 2026-11-09 — Hasan Alizada — HAAL-154. Seen on the demo stand: the image 1.0.0-rc.3 answered 0.1.0."""
    monkeypatch.setenv("HAALENDAR_VERSION", "9.8.7-rc.6")
    assert importlib.reload(haalendar).__version__ == "9.8.7-rc.6"
    monkeypatch.undo()
    importlib.reload(haalendar)
    dockerfile = (Path(__file__).resolve().parents[2] / "Dockerfile").read_text()
    assert 'HAALENDAR_VERSION="${VERSION}"' in dockerfile
