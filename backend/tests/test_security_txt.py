"""security.txt (RFC 9116) at /.well-known/security.txt.

+++===+++ 2026-11-13 21:58 +04 — Hasan Alizada — HAAL-177. Served only when the operator names a contact
(HAALENDAR_SECURITY_CONTACT): Contact, Expires 180 days ahead, Preferred-Languages and Canonical, as plain text, also
beside the web app; without the setting a 404 as before; a contact that is not a mailto: or https: address, or has a
line break, stops the start.
"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from pydantic import ValidationError

from haalendar.main import create_app

from .conftest import make_settings

PATH = "/.well-known/security.txt"
FORM = "https://github.com/hasanfalizada/Haalendar/security/advisories/new"


def _fields(body: str) -> dict[str, str]:
    pairs = (line.split(": ", 1) for line in body.splitlines() if line and not line.startswith("#"))
    return dict(pairs)


def test_not_served_without_a_contact() -> None:
    with TestClient(create_app(make_settings())) as client:
        response = client.get(PATH)
    assert response.status_code == 404


def test_served_with_a_contact() -> None:
    settings = make_settings(security_contact=FORM, public_url="https://calendar.example.org")
    before = datetime.now(UTC)
    with TestClient(create_app(settings)) as client:
        response = client.get(PATH, headers={"Host": "calendar.example.org"})
        head = client.head(PATH, headers={"Host": "calendar.example.org"})
    assert response.status_code == 200
    assert response.headers["content-type"] == "text/plain; charset=utf-8"
    assert head.status_code == 200
    fields = _fields(response.text)
    assert fields["Contact"] == FORM
    assert fields["Preferred-Languages"] == "en"
    assert fields["Canonical"] == "https://calendar.example.org/.well-known/security.txt"
    expires = datetime.fromisoformat(fields["Expires"])
    assert fields["Expires"].endswith("Z")
    assert before + timedelta(days=179) < expires < before + timedelta(days=181)


def test_served_beside_the_web_app(tmp_path: Path) -> None:
    (tmp_path / "index.html").write_text("<!doctype html>")
    settings = make_settings(security_contact="mailto:security@example.org", static_dir=str(tmp_path))
    with TestClient(create_app(settings)) as client:
        response = client.get(PATH)
    assert response.status_code == 200
    assert _fields(response.text)["Contact"] == "mailto:security@example.org"


@pytest.mark.parametrize(
    "contact",
    [
        "security@example.org",  # no scheme
        "http://example.org/report",  # not https
        "mailto:",  # no address
        "https://example.org/a\nPolicy: https://evil.example",  # a second line
    ],
)
def test_a_wrong_contact_stops_the_start(contact: str) -> None:
    with pytest.raises(ValidationError, match="HAALENDAR_SECURITY_CONTACT"):
        make_settings(security_contact=contact)
