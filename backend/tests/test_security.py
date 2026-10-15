"""Security baseline: Host allow-list, rate limiting, body/content-type limits, CSRF origin check, CSP, uploads, input models.

+++===+++ 2026-10-15 — Hasan Alizada — HAAL-020.
"""

from __future__ import annotations

from collections.abc import Iterator

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from pydantic import ValidationError

from haalendar.errors import ProblemError
from haalendar.main import create_app
from haalendar.middleware import SPA_CSP
from haalendar.security.guards import TokenBucketLimiter
from haalendar.security.schemas import ApiModel
from haalendar.security.uploads import (
    MAX_IMAGE_BYTES,
    detect_image_type,
    sanitize_filename,
    validate_image_upload,
)

from .conftest import make_settings

PNG = b"\x89PNG\r\n\x1a\n" + b"\x00" * 8
JPEG = b"\xff\xd8\xff\xe0" + b"\x00" * 8
GIF = b"GIF89a" + b"\x00" * 8
WEBP = b"RIFF\x00\x00\x00\x00WEBPVP8 "


def _app(**overrides: str) -> FastAPI:
    app = create_app(make_settings(**overrides))

    @app.post("/api/v1/_test/echo")
    async def echo(payload: dict[str, object]) -> dict[str, object]:
        return payload

    return app


@pytest.fixture
def client() -> Iterator[TestClient]:
    with TestClient(_app(), raise_server_exceptions=False) as test_client:
        yield test_client


# ---------- Host allow-list ----------


def test_unknown_host_is_rejected_with_problem_and_headers(client: TestClient) -> None:
    response = client.get("/api/v1/health/live", headers={"Host": "evil.example"})
    assert response.status_code == 400
    assert response.headers["content-type"] == "application/problem+json"
    assert response.json()["code"] == "bad_request"
    assert response.json()["request_id"] == response.headers["x-request-id"]
    assert response.headers["x-content-type-options"] == "nosniff"


@pytest.mark.parametrize("host", ["localhost:8080", "127.0.0.1", "[::1]:8080", "LOCALHOST"])
def test_loopback_and_public_hosts_are_allowed(client: TestClient, host: str) -> None:
    assert client.get("/api/v1/health/live", headers={"Host": host}).status_code == 200


def test_public_url_host_is_allowed() -> None:
    with TestClient(_app(public_url="https://cal.example.org")) as client:
        assert client.get("/api/v1/health/live", headers={"Host": "cal.example.org"}).status_code == 200


# ---------- Rate limiting ----------


def test_rate_limit_returns_429_with_retry_headers() -> None:
    with TestClient(_app(rate_limit_per_minute="60", rate_limit_burst="3")) as client:
        statuses = [client.get("/api/v1/unknown").status_code for _ in range(4)]
        blocked = client.get("/api/v1/unknown")
    assert statuses[:3] == [404, 404, 404]
    assert statuses[3] == 429
    assert blocked.json()["code"] == "rate_limited"
    assert int(blocked.headers["retry-after"]) >= 1
    assert blocked.headers["ratelimit-policy"] == '"default";q=60;w=60'


def test_health_probes_are_never_rate_limited() -> None:
    with TestClient(_app(rate_limit_per_minute="60", rate_limit_burst="1")) as client:
        assert all(client.get("/api/v1/health/live").status_code == 200 for _ in range(5))


def test_token_bucket_refills_over_time_and_bounds_memory() -> None:
    limiter = TokenBucketLimiter(per_minute=60, burst=2, max_clients=3)
    assert limiter.take("a", now=0.0) == (True, 0.0)
    assert limiter.take("a", now=0.0)[0] is True
    allowed, wait = limiter.take("a", now=0.0)
    assert allowed is False
    assert wait == pytest.approx(1.0)
    assert limiter.take("a", now=1.0)[0] is True  # one token per second refilled
    for key in ("b", "c", "d", "e"):
        limiter.take(key, now=2.0)
    assert len(limiter._buckets) == 3


# ---------- Body size and content type ----------


def test_declared_oversized_body_is_rejected_before_reading(client: TestClient) -> None:
    response = client.post(
        "/api/v1/_test/echo",
        content=b"{}",
        headers={"Content-Type": "application/json", "Content-Length": str(2 * 1024 * 1024)},
    )
    assert response.status_code == 413
    assert response.json()["code"] == "payload_too_large"


def test_streamed_oversized_body_is_rejected() -> None:
    def chunks() -> Iterator[bytes]:
        for _ in range(20):
            yield b"x" * 1024

    with TestClient(_app(max_request_body_bytes="4096")) as client:
        response = client.post(
            "/api/v1/_test/echo", content=chunks(), headers={"Content-Type": "application/json"}
        )
    assert response.status_code == 413


def test_unsupported_content_type_is_rejected(client: TestClient) -> None:
    response = client.post("/api/v1/_test/echo", content=b"a=1", headers={"Content-Type": "text/plain"})
    assert response.status_code == 415
    assert response.json()["code"] == "unsupported_media_type"


def test_valid_json_passes_all_guards(client: TestClient) -> None:
    response = client.post("/api/v1/_test/echo", json={"hello": "world"})
    assert response.status_code == 200
    assert response.json() == {"hello": "world"}


# ---------- CSRF origin check ----------


@pytest.mark.parametrize(
    "headers",
    [
        {"Origin": "https://evil.example"},
        {"Origin": "null"},
        {"Sec-Fetch-Site": "cross-site"},
    ],
)
def test_cross_site_unsafe_requests_are_rejected(client: TestClient, headers: dict[str, str]) -> None:
    response = client.post("/api/v1/_test/echo", json={}, headers=headers)
    assert response.status_code == 403
    assert response.json()["code"] == "csrf_failed"


def test_same_origin_and_non_browser_requests_pass(client: TestClient) -> None:
    same_origin = client.post(
        "/api/v1/_test/echo",
        json={"a": 1},
        headers={"Origin": "http://localhost:8080", "Sec-Fetch-Site": "same-origin"},
    )
    no_origin = client.post("/api/v1/_test/echo", json={"a": 1})
    assert same_origin.status_code == 200
    assert no_origin.status_code == 200


def test_safe_methods_are_not_subject_to_origin_check(client: TestClient) -> None:
    assert client.get("/api/v1/health/live", headers={"Origin": "https://evil.example"}).status_code == 200


def test_allowed_origins_follow_environment() -> None:
    assert "http://localhost:5173" in make_settings(env="development").allowed_origins
    production = make_settings(env="production", secret_key="k" * 40, public_url="https://cal.example.org")
    assert production.allowed_origins == frozenset({"https://cal.example.org"})
    assert "cal.example.org" in production.allowed_hosts


# ---------- Content Security Policy ----------


def test_spa_paths_get_strict_csp(client: TestClient) -> None:
    response = client.get("/some/spa/route")
    csp = response.headers["content-security-policy"]
    assert csp == SPA_CSP.decode()
    assert "'unsafe-eval'" not in csp
    assert "script-src 'self'" in csp
    assert "frame-ancestors 'none'" in csp


# ---------- Uploads ----------


@pytest.mark.parametrize(
    ("head", "expected"),
    [(PNG, "image/png"), (JPEG, "image/jpeg"), (GIF, "image/gif"), (WEBP, "image/webp")],
)
def test_image_types_are_detected_by_signature(head: bytes, expected: str) -> None:
    assert detect_image_type(head) == expected


@pytest.mark.parametrize(
    "head",
    [b"<svg xmlns=", b"<!DOCTYPE html>", b"MZ\x90\x00", b"%PDF-1.7", b"RIFF\x00\x00\x00\x00WAVE"],
)
def test_non_images_and_active_content_are_rejected(head: bytes) -> None:
    assert detect_image_type(head) is None
    with pytest.raises(ProblemError) as caught:
        validate_image_upload(head, 100, "file.png")
    assert caught.value.status == 415


def test_upload_size_limits() -> None:
    with pytest.raises(ProblemError) as too_big:
        validate_image_upload(PNG, MAX_IMAGE_BYTES + 1, "big.png")
    assert too_big.value.status == 413
    with pytest.raises(ProblemError):
        validate_image_upload(PNG, 0, "empty.png")
    ok = validate_image_upload(JPEG, 2048, "Holiday photo.jpeg")
    assert (ok.media_type, ok.file_name, ok.size_bytes) == ("image/jpeg", "Holiday photo.jpg", 2048)


@pytest.mark.parametrize(
    ("name", "media_type", "expected"),
    [
        ("../../etc/passwd", "image/png", "passwd.png"),
        ("C:\\Users\\me\\scan.PNG", "image/png", "scan.png"),
        ("invoice.pdf.exe", "image/jpeg", "invoice.pdf.jpg"),
        ("a\x00b\x1fc<>:|?*.gif", "image/gif", "abc.gif"),
        ("...hidden", "image/webp", "hidden.webp"),
        ("", "image/png", "image.png"),
    ],
)
def test_filenames_are_sanitized(name: str, media_type: str, expected: str) -> None:
    assert sanitize_filename(name, media_type) == expected


def test_long_filenames_are_truncated() -> None:
    result = sanitize_filename("x" * 500 + ".png", "image/png")
    assert len(result) == 120
    assert result.endswith(".png")


# ---------- Input models ----------


def test_api_models_reject_unknown_fields() -> None:
    class Example(ApiModel):
        title: str

    assert Example(title="ok").title == "ok"
    with pytest.raises(ValidationError):
        Example.model_validate({"title": "ok", "owner_id": "attacker"})
