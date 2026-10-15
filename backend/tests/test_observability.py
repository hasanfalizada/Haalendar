"""Metrics endpoint, label cardinality, slow-query logging and the emitted JSON log lines.

+++===+++ 2026-10-15 — Hasan Alizada — HAAL-019.
"""

from __future__ import annotations

import json

import pytest
from fastapi.testclient import TestClient
from pydantic import ValidationError

from haalendar.config import load_settings
from haalendar.logging import configure_logging, get_logger
from haalendar.main import create_app
from haalendar.observability import Metrics, log_if_slow

from .conftest import make_settings

TOKEN = "t" * 32


def _metrics_client() -> TestClient:
    return TestClient(create_app(make_settings(metrics_enabled="true", metrics_token=TOKEN)))


def _json_lines(captured: str) -> list[dict[str, object]]:
    return [json.loads(line) for line in captured.splitlines() if line.startswith("{")]


def test_metrics_disabled_by_default(client: TestClient) -> None:
    assert client.get("/metrics").status_code == 404


def test_metrics_require_a_strong_token() -> None:
    with pytest.raises(ValidationError, match="METRICS_TOKEN"):
        load_settings({"HAALENDAR_METRICS_ENABLED": "true"})
    with pytest.raises(ValidationError, match="METRICS_TOKEN"):
        load_settings({"HAALENDAR_METRICS_ENABLED": "true", "HAALENDAR_METRICS_TOKEN": "short"})


def test_metrics_reject_missing_or_wrong_token() -> None:
    with _metrics_client() as client:
        missing = client.get("/metrics")
        wrong = client.get("/metrics", headers={"Authorization": "Bearer nope"})
    assert missing.status_code == 401
    assert missing.headers["content-type"] == "application/problem+json"
    assert wrong.status_code == 401


def test_metrics_expose_http_pool_and_build_info() -> None:
    with _metrics_client() as client:
        client.get("/api/v1/health/live")
        client.get("/api/v1/health/live")
        body = client.get("/metrics", headers={"Authorization": f"Bearer {TOKEN}"}).text
    assert 'haalendar_http_requests_total{method="GET",route="/api/v1/health/live",status="200"} 2.0' in body
    assert (
        'haalendar_http_request_duration_seconds_bucket{le="0.2",method="GET",route="/api/v1/health/live"}'
        in body
    )
    assert "haalendar_http_requests_in_progress" in body
    assert "haalendar_db_pool_size 5.0" in body
    assert 'haalendar_build_info{env="test",version="0.1.0"} 1.0' in body


def test_unknown_paths_never_become_metric_labels() -> None:
    with _metrics_client() as client:
        client.get("/api/v1/users/secret-user-42/orders")
        body = client.get("/metrics", headers={"Authorization": f"Bearer {TOKEN}"}).text
    assert 'route="unmatched",status="404"' in body
    assert "secret-user-42" not in body


def test_slow_query_logged_without_parameters(capsys: pytest.CaptureFixture[str]) -> None:
    configure_logging(make_settings())
    capsys.readouterr()
    metrics = Metrics(make_settings())
    assert log_if_slow("SELECT  *\n FROM item WHERE title = %(title)s", 350.0, 200, metrics) is True
    assert log_if_slow("SELECT 1", 10.0, 200, metrics) is False
    lines = _json_lines(capsys.readouterr().out)
    slow = [line for line in lines if line["event"] == "db_slow_query"]
    assert len(slow) == 1
    assert slow[0]["statement"] == "SELECT * FROM item WHERE title = %(title)s"
    assert slow[0]["level"] == "warning"
    assert "haalendar_db_slow_queries_total 1.0" in metrics.render().decode()


def test_request_log_line_is_json_with_correlation_fields(capsys: pytest.CaptureFixture[str]) -> None:
    app = create_app(make_settings())
    capsys.readouterr()
    with TestClient(app) as client:
        client.get("/api/v1/health/live", headers={"X-Request-ID": "corr-123"})
    lines = _json_lines(capsys.readouterr().out)
    request_lines = [line for line in lines if line["event"] == "request_completed"]
    assert request_lines, lines
    line = request_lines[-1]
    assert line["request_id"] == "corr-123"
    assert line["route"] == "/api/v1/health/live"
    assert line["status"] == 200
    assert line["level"] == "info"
    assert "timestamp" in line


def test_emitted_log_lines_never_contain_secrets(capsys: pytest.CaptureFixture[str]) -> None:
    configure_logging(make_settings())
    capsys.readouterr()
    get_logger("test").info(
        "login_attempt", email="a@example.org", password="hunter2", headers={"Cookie": "__Host-s=abc"}
    )
    out = capsys.readouterr().out
    assert "hunter2" not in out
    assert "__Host-s=abc" not in out
    assert "a@example.org" in out
