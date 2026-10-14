"""RFC 9457 problem responses, request correlation and security headers.

+++===+++ 2026-10-14 — Hasan Alizada — HAAL-016. Test-only routes are mounted on the app to trigger each error path.
"""

from __future__ import annotations

from collections.abc import Iterator

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from haalendar.errors import ProblemCode, ProblemError
from haalendar.main import create_app

from .conftest import make_settings


def _app_with_test_routes(**settings_overrides: str) -> FastAPI:
    app = create_app(make_settings(**settings_overrides))

    @app.get("/api/v1/_test/needs-int")
    async def needs_int(count: int) -> dict[str, int]:
        return {"count": count}

    @app.get("/api/v1/_test/conflict")
    async def conflict() -> None:
        raise ProblemError(
            412, ProblemCode.VERSION_CONFLICT, "Changed by someone else", current={"version": 7}
        )

    @app.get("/api/v1/_test/crash")
    async def crash() -> None:
        raise RuntimeError("database password is hunter2")

    return app


@pytest.fixture
def test_client() -> Iterator[TestClient]:
    with TestClient(_app_with_test_routes(), raise_server_exceptions=False) as client:
        yield client


def _assert_problem(response_json: dict[str, object], status: int, code: str) -> None:
    assert response_json["status"] == status
    assert response_json["code"] == code
    assert response_json["type"] == f"/problems/{code}"
    assert response_json["title"]
    assert response_json["request_id"]


def test_unknown_route_is_not_found_problem(test_client: TestClient) -> None:
    response = test_client.get("/api/v1/does-not-exist")
    assert response.status_code == 404
    assert response.headers["content-type"] == "application/problem+json"
    _assert_problem(response.json(), 404, "not_found")
    assert response.json()["request_id"] == response.headers["x-request-id"]


def test_validation_error_has_json_pointer(test_client: TestClient) -> None:
    response = test_client.get("/api/v1/_test/needs-int", params={"count": "abc"})
    assert response.status_code == 422
    body = response.json()
    _assert_problem(body, 422, "validation_failed")
    assert body["errors"][0]["pointer"] == "/query/count"


def test_domain_problem_carries_current_state(test_client: TestClient) -> None:
    response = test_client.get("/api/v1/_test/conflict")
    assert response.status_code == 412
    body = response.json()
    _assert_problem(body, 412, "version_conflict")
    assert body["detail"] == "Changed by someone else"
    assert body["current"] == {"version": 7}


def test_unhandled_exception_is_generic_500_with_security_headers(test_client: TestClient) -> None:
    response = test_client.get("/api/v1/_test/crash")
    assert response.status_code == 500
    _assert_problem(response.json(), 500, "internal_error")
    assert "hunter2" not in response.text
    assert response.headers["x-content-type-options"] == "nosniff"
    assert response.headers["x-request-id"]


def test_security_headers_on_api_responses(test_client: TestClient) -> None:
    response = test_client.get("/api/v1/health/live")
    headers = response.headers
    assert headers["x-content-type-options"] == "nosniff"
    assert headers["referrer-policy"] == "no-referrer"
    assert headers["content-security-policy"] == "default-src 'none'; frame-ancestors 'none'"
    assert headers["cross-origin-opener-policy"] == "same-origin"
    assert headers["cross-origin-resource-policy"] == "same-origin"
    assert headers["cache-control"] == "no-store"
    assert "server" not in headers
    assert "strict-transport-security" not in headers  # public_url is http in tests


def test_hsts_only_when_public_url_is_https() -> None:
    with TestClient(_app_with_test_routes(public_url="https://cal.example.org")) as client:
        response = client.get("/api/v1/health/live")
    assert response.headers["strict-transport-security"] == "max-age=31536000; includeSubDomains"


def test_valid_incoming_request_id_is_propagated(test_client: TestClient) -> None:
    response = test_client.get("/api/v1/health/live", headers={"X-Request-ID": "abc-123.DEF_4"})
    assert response.headers["x-request-id"] == "abc-123.DEF_4"


def test_invalid_incoming_request_id_is_replaced(test_client: TestClient) -> None:
    response = test_client.get("/api/v1/health/live", headers={"X-Request-ID": "bad id <script>"})
    assert response.headers["x-request-id"] != "bad id <script>"
    assert len(response.headers["x-request-id"]) == 32


def test_interactive_docs_disabled_outside_development() -> None:
    with TestClient(create_app(make_settings(env="test"))) as client:
        assert client.get("/api/v1/docs").status_code == 404
        assert client.get("/api/v1/openapi.json").status_code == 404
