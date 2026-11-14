"""The web app served by the API (HAALENDAR_STATIC_DIR; ADR-0004 single origin).

+++===+++ 2026-11-01 — Hasan Alizada — HAAL-150. Files as they are with the right caching, routes of the app answered
with index.html, missing files and anything outside the directory refused, the API untouched, the strict SPA
Content-Security-Policy on every page, and no web app at all when the setting is empty.
"""

from __future__ import annotations

from collections.abc import Iterator
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from haalendar.main import create_app
from haalendar.middleware import SPA_CSP

from .conftest import make_settings

INDEX = b"<!doctype html><title>Haalendar</title>"


@pytest.fixture
def dist(tmp_path: Path) -> Path:
    root = tmp_path / "dist"
    (root / "assets").mkdir(parents=True)
    (root / "index.html").write_bytes(INDEX)
    (root / "assets" / "index-abc123.js").write_text("console.log(1)")
    (root / "sw.js").write_text("self.addEventListener('install', () => {})")
    (root / "manifest.webmanifest").write_text("{}")
    (tmp_path / "secret.txt").write_text("outside")
    (root / ".hidden").write_text("dot file")
    return root


@pytest.fixture
def web(dist: Path) -> Iterator[TestClient]:
    with TestClient(create_app(make_settings(static_dir=str(dist)))) as client:
        yield client


@pytest.mark.no_contract
def test_files_are_served_with_caching_for_their_kind(web: TestClient) -> None:
    asset = web.get("/assets/index-abc123.js")
    assert asset.status_code == 200 and asset.text == "console.log(1)"
    assert asset.headers["cache-control"] == "public, max-age=31536000, immutable"
    assert asset.headers["content-type"].startswith("text/javascript")
    for path in ("/sw.js", "/manifest.webmanifest", "/", "/index.html"):
        response = web.get(path)
        assert response.status_code == 200, path
        assert response.headers["cache-control"] == "no-cache", path
        assert response.headers["content-security-policy"] == SPA_CSP.decode(), path
    assert web.head("/assets/index-abc123.js").status_code == 200


@pytest.mark.no_contract
def test_no_page_or_file_is_offered_to_search_engines(web: TestClient) -> None:
    """HAAL-176, D-105: every answer of the web app says noindex, and no robots.txt hides that from a crawler."""
    for path in ("/", "/index.html", "/calendar/week", "/assets/index-abc123.js", "/sw.js", "/missing.png"):
        assert web.get(path).headers["x-robots-tag"] == "noindex, nofollow", path
    robots = web.get("/robots.txt")
    assert robots.status_code == 404 and "disallow" not in robots.text.lower()


@pytest.mark.no_contract
def test_routes_of_the_app_get_index_html_and_missing_files_a_404(web: TestClient) -> None:
    for route in ("/calendar", "/kanban/0199f000-0000-7000-8000-000000000001", "/settings", "/todo"):
        response = web.get(route, params={"date": "2026-11-04"})
        assert response.status_code == 200 and response.content == INDEX, route
        assert response.headers["cache-control"] == "no-cache"
    assert web.get("/assets/gone-123.js").status_code == 404
    assert web.get("/favicon.png").status_code == 404


@pytest.mark.no_contract
def test_nothing_outside_the_directory_or_hidden_is_served(web: TestClient) -> None:
    for path in (
        "/../secret.txt",
        "/%2e%2e/secret.txt",
        "/assets/../../secret.txt",
        "/.hidden",
        "/assets/%2e%2e%2f..%2fsecret.txt",
    ):
        response = web.get(path)
        assert b"outside" not in response.content and b"dot file" not in response.content, path


@pytest.mark.no_contract
def test_the_api_and_metrics_are_never_answered_by_the_web_app(web: TestClient) -> None:
    unknown = web.get("/api/v1/no-such-thing")
    assert unknown.status_code == 404 and unknown.headers["content-type"] == "application/problem+json"
    assert web.get("/api/v1/health/live").json()["status"] == "ok"
    assert web.get("/metrics").status_code == 404
    assert web.post("/calendar", json={}).status_code == 405


@pytest.mark.no_contract
def test_without_the_setting_no_web_app_is_served() -> None:
    with TestClient(create_app(make_settings())) as client:
        assert client.get("/calendar").status_code == 404


def test_a_directory_without_index_html_is_refused(tmp_path: Path) -> None:
    with pytest.raises(RuntimeError, match=r"no index\.html"):
        create_app(make_settings(static_dir=str(tmp_path)))
