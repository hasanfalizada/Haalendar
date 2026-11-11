"""The app implements the API contract (ADR-0007, test strategy).

+++===+++ 2026-10-30 — Hasan Alizada — HAAL-140. The operations of the app (FastAPI's own description of its routes)
and of api/openapi.yaml are compared both ways: every route of the app is a contract operation with the same path,
method and operationId, and its success status is documented; a contract operation the app does not serve says why in
`x-not-implemented` (served through /sync, computed in the web app, or planned with its task), and one the app serves
does not. The responses themselves are checked in every test (conftest.contract_responses, tests/contract.py).
"""

from __future__ import annotations

import json

from fastapi import FastAPI

from . import contract
from .conftest import make_settings

METHODS = contract.METHODS


def _app_operations() -> dict[tuple[str, str], dict[str, object]]:
    from haalendar.main import create_app

    app: FastAPI = create_app(make_settings(env="test"))
    found = {}
    for path, item in app.openapi()["paths"].items():
        for method, op in item.items():
            if method in METHODS:
                found[(method, path.removeprefix(contract.PREFIX))] = op
    return found


def _contract_operations() -> dict[tuple[str, str], contract.Operation]:
    return {(op.method, op.path): op for op in contract.operations()}


def test_every_route_of_the_app_is_a_contract_operation() -> None:
    app, spec = _app_operations(), _contract_operations()
    missing = sorted(f"{m.upper()} {p}" for m, p in app if (m, p) not in spec)
    assert not missing, f"Routes missing from api/openapi.yaml (or named differently): {missing}"
    wrong_id = sorted(
        f"{m.upper()} {p}: {op.get('operationId')} ≠ {spec[(m, p)].operation_id}"
        for (m, p), op in app.items()
        if op.get("operationId") != spec[(m, p)].operation_id
    )
    assert not wrong_id, f"operationId differs from the contract: {wrong_id}"


def test_the_success_status_of_every_route_is_documented() -> None:
    spec = _contract_operations()
    undocumented = []
    for key, op in _app_operations().items():
        responses = op.get("responses")
        assert isinstance(responses, dict)
        for status in responses:
            if status.startswith("2") and status not in spec[key].responses:
                undocumented.append(f"{spec[key].operation_id}: {status}")
    assert not undocumented, f"Success statuses the contract does not document: {undocumented}"


def test_contract_operations_the_app_does_not_serve_say_why() -> None:
    app = _app_operations()
    unexplained = sorted(
        f"{op.operation_id} ({op.method.upper()} {op.path})"
        for key, op in _contract_operations().items()
        if key not in app and not op.not_implemented
    )
    assert not unexplained, f"Not served and no x-not-implemented: {unexplained}"
    stale = sorted(
        f"{op.operation_id} ({op.method.upper()} {op.path})"
        for key, op in _contract_operations().items()
        if key in app and op.not_implemented
    )
    assert not stale, f"Served by the app but still marked x-not-implemented: {stale}"


def test_the_response_check_finds_what_breaks_the_contract() -> None:
    url, media = "/api/v1/setup/status", "application/json"
    good = {
        "setup_required": True,
        "setup_token_required": False,
        "registration_mode": "invite",
        "demo_mode": False,
    }
    assert contract.problems("GET", url, 200, media, json.dumps(good).encode()) == []
    wrong = contract.problems("GET", url, 200, media, json.dumps({**good, "setup_required": "yes"}).encode())
    assert wrong == [
        "getSetupStatus (GET /setup/status) 200: $.setup_required: 'yes' is not of type 'boolean'"
    ]
    assert contract.problems("GET", url, 200, media, json.dumps({"demo_mode": False}).encode())
    assert contract.problems("GET", url, 418, media, b"{}") == [
        "getSetupStatus (GET /setup/status): status 418 is not documented"
    ]
    assert contract.problems("GET", "/api/v1/no-such-thing", 200, media, b"{}") == [
        "GET /no-such-thing: no such operation in the contract"
    ]
    assert contract.problems("GET", url, 200, media, b"") == [
        "getSetupStatus (GET /setup/status) 200: empty body, application/json expected"
    ]
    # A shared response ($ref into common.yaml: 401 → Problem) is resolved too.
    problem = {
        "type": "/problems/session_expired",
        "title": "Unauthorized",
        "status": 401,
        "code": "session_expired",
    }
    body = json.dumps(problem).encode()
    assert contract.problems("GET", "/api/v1/me", 401, "application/problem+json", body) == []
    assert contract.problems(
        "GET", "/api/v1/me", 401, "application/problem+json", json.dumps({"title": "x"}).encode()
    )
    # Outside the API (the web app, /metrics) nothing is checked.
    assert contract.problems("GET", "/calendar", 200, "text/html", b"<html>") == []
