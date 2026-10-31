"""The worker's health check (`haalendar-worker check`, the compose health check of the worker service; marker `db`).

+++===+++ 2026-11-01 — Hasan Alizada — HAAL-150. Healthy while a worker has updated its heartbeat in the last minute.
"""

from __future__ import annotations

import pytest

from haalendar import jobs

from .account_helpers import sql, sql_maintenance
from .conftest import make_settings

pytestmark = pytest.mark.db


def test_healthy_only_with_a_recent_heartbeat(
    clean_db: str, owner_db_url: str, monkeypatch: pytest.MonkeyPatch
) -> None:
    settings = make_settings(database_url=clean_db)
    assert jobs.worker_alive(settings) is False
    sql(clean_db, "INSERT INTO procrastinate_workers DEFAULT VALUES")
    assert jobs.worker_alive(settings) is True
    sql_maintenance(
        owner_db_url, "UPDATE procrastinate_workers SET last_heartbeat = now() - interval '2 minutes'"
    )
    assert jobs.worker_alive(settings) is False

    monkeypatch.setattr(jobs, "load_settings", lambda: settings)
    monkeypatch.setattr("sys.argv", ["haalendar-worker", "check"])
    with pytest.raises(SystemExit) as stopped:
        jobs.run_worker()
    assert stopped.value.code == 1
