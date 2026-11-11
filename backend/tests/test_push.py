"""Web Push end to end against a local fake push service (FR-CAL-29, D-79): the VAPID key is made once and kept
encrypted; a browser subscribes (again: the same row), another user on the same browser takes the endpoint over, the
user revokes it; production accepts only the known push services; a reminder that fires on time reaches the browser
encrypted and signed (the test decrypts it with the browser's key), a late one does not, and a subscription the push
service has dropped (410) is revoked. Marker `db` except the endpoint rule.

+++===+++ 2026-10-28 — Hasan Alizada — HAAL-091 (stage 2).
"""

from __future__ import annotations

import json
import threading
from collections.abc import Iterator
from datetime import UTC, datetime
from http.server import BaseHTTPRequestHandler, HTTPServer
from typing import Any

import pytest
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.asymmetric import ec
from cryptography.hazmat.primitives.asymmetric.utils import encode_dss_signature
from fastapi.testclient import TestClient

from haalendar.push.service import _endpoint_allowed
from haalendar.push.webpush import b64url, b64url_decode, public_bytes

from .conftest import make_settings
from .test_reminders import _as, _event, _reminder, _run
from .test_sharing import People
from .test_webpush import _decrypt


class FakePushService:
    """Records what is posted and answers with `status`."""

    def __init__(self) -> None:
        self.received: list[tuple[dict[str, str], bytes]] = []
        self.status = 201
        service = self

        class Handler(BaseHTTPRequestHandler):
            def do_POST(self) -> None:
                body = self.rfile.read(int(self.headers["Content-Length"]))
                service.received.append(({k.lower(): v for k, v in self.headers.items()}, body))
                self.send_response(service.status)
                self.send_header("Content-Length", "0")
                self.end_headers()

            def log_message(self, *args: Any) -> None:
                pass

        self.server = HTTPServer(("127.0.0.1", 0), Handler)
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True)
        self.thread.start()

    def endpoint(self, name: str) -> str:
        return f"http://127.0.0.1:{self.server.server_port}/push/{name}"

    def close(self) -> None:
        self.server.shutdown()


@pytest.fixture
def people(api: TestClient, clean_db: str) -> People:
    return People(api, clean_db)


@pytest.fixture
def push_service() -> Iterator[FakePushService]:
    service = FakePushService()
    yield service
    service.close()


class Browser:
    def __init__(self) -> None:
        self.key = ec.generate_private_key(ec.SECP256R1())
        self.auth = b64url(b"abcdefghijklmnop")

    def subscription(self, endpoint: str) -> dict[str, Any]:
        return {
            "endpoint": endpoint,
            "keys": {"p256dh": b64url(public_bytes(self.key.public_key())), "auth": self.auth},
            "expirationTime": None,
        }


def utc(year: int, month: int, day: int, hour: int = 0, minute: int = 0) -> datetime:
    return datetime(year, month, day, hour, minute, tzinfo=UTC)


def test_production_posts_only_to_known_push_services() -> None:
    # Only the two fields the rule reads are switched (full production settings need secrets and storage).
    settings = make_settings().model_copy(
        update={"env": "production", "push_extra_hosts": "push.example.net"}
    )
    allowed = [
        "https://fcm.googleapis.com/fcm/send/abc",
        "https://jmt17.google.com/fcm/send/abc",
        "https://updates.push.services.mozilla.com/wpush/v2/abc",
        "https://wns2-par02p.notify.windows.com/w/?token=abc",
        "https://web.push.apple.com/abc",
        "https://push.example.net/abc",
    ]
    refused = [
        "http://fcm.googleapis.com/fcm/send/abc",
        "https://evil.example.com/abc",
        "https://fcm.googleapis.com.evil.example.com/abc",
        "https://127.0.0.1/abc",
        "https://localhost:8081/api/v1/admin",
    ]
    assert all(_endpoint_allowed(url, settings) for url in allowed)
    assert not any(_endpoint_allowed(url, settings) for url in refused)


@pytest.mark.db
def test_keys_subscribe_take_over_and_revoke(people: People, push_service: FakePushService) -> None:
    ada = people.as_("ada")
    first = people.api.get("/api/v1/push/vapid-public-key", headers=ada).json()["public_key"]
    assert len(b64url_decode(first)) == 65
    assert people.api.get("/api/v1/push/vapid-public-key", headers=ada).json()["public_key"] == first
    stored = _as(people, "ada", "SELECT private_key_enc FROM push_key")[0][0]
    assert "PRIVATE KEY" not in stored  # encrypted at rest

    browser = Browser()
    endpoint = push_service.endpoint("shared-laptop")
    created = people.api.post(
        "/api/v1/me/push-subscriptions", json=browser.subscription(endpoint), headers=ada
    )
    assert created.status_code == 201, created.text
    again = people.api.post("/api/v1/me/push-subscriptions", json=browser.subscription(endpoint), headers=ada)
    assert again.json()["id"] == created.json()["id"]
    bad = people.api.post(
        "/api/v1/me/push-subscriptions",
        json={"endpoint": endpoint, "keys": {"p256dh": "short", "auth": "x"}},
        headers=ada,
    )
    assert bad.status_code == 422

    # Bob signs in on the same browser and turns notifications on: Ada's subscription of it ends.
    bob = people.as_("bob")
    assert (
        people.api.post(
            "/api/v1/me/push-subscriptions", json=browser.subscription(endpoint), headers=bob
        ).status_code
        == 201
    )
    assert _as(people, "ada", "SELECT revoke_reason FROM push_subscription") == [("claimed",)]

    mine = _as(people, "bob", "SELECT id FROM push_subscription")[0][0]
    gone = people.api.delete(f"/api/v1/me/push-subscriptions/{mine}?reason=sign_out", headers=bob)
    assert gone.status_code == 204
    assert _as(people, "bob", "SELECT revoke_reason FROM push_subscription") == [("sign_out",)]
    ada = people.as_("ada")
    assert people.api.delete(f"/api/v1/me/push-subscriptions/{mine}", headers=ada).status_code == 404


@pytest.mark.db
def test_a_fired_reminder_reaches_the_browser_encrypted_and_signed(
    people: People, push_service: FakePushService
) -> None:
    ada = people.as_("ada")
    browser = Browser()
    subscribed = people.api.post(
        "/api/v1/me/push-subscriptions", json=browser.subscription(push_service.endpoint("ada")), headers=ada
    )
    assert subscribed.status_code == 201
    event = _event(people, ada, location="Main St 1")  # 10 November 11:00 Berlin = 10:00 UTC
    _reminder(people, ada, event, offset_minutes=15)
    public_key = people.api.get("/api/v1/push/vapid-public-key", headers=ada).json()["public_key"]
    settings = make_settings(database_url=people.db_url)

    _run(people, utc(2026, 11, 1), settings)
    assert _run(people, utc(2026, 11, 10, 9, 45), settings) == {"fired": 1}
    [(headers, body)] = push_service.received
    assert headers["content-encoding"] == "aes128gcm" and headers["urgency"] == "high"
    message = json.loads(_decrypt(body, browser.key, browser.auth))
    # Ada's zone is the profile default of the test users.
    zone_time = _as(
        people, "ada", "SELECT time_zone FROM user_account WHERE id = haalendar_current_user_id()"
    )[0][0]
    assert message["title"] == "Reminder: Dentist"
    assert message["body"].startswith("Today, ") and message["body"].endswith(" · Main St 1"), (
        zone_time,
        message,
    )
    assert message["url"].startswith("/calendar?date=2026-11-1") and f"event={event}" in message["url"]

    # The VAPID token is signed with the instance's key, for the push service's origin.
    token, key = headers["authorization"][len("vapid t=") :].split(", k=")
    assert key == public_key
    head, claims, signature = token.split(".")
    assert json.loads(b64url_decode(claims))["aud"] == push_service.endpoint("")[: -len("/push/")]
    raw = b64url_decode(signature)
    ec.EllipticCurvePublicKey.from_encoded_point(ec.SECP256R1(), b64url_decode(key)).verify(
        encode_dss_signature(int.from_bytes(raw[:32], "big"), int.from_bytes(raw[32:], "big")),
        f"{head}.{claims}".encode(),
        ec.ECDSA(hashes.SHA256()),
    )
    assert _as(people, "ada", "SELECT delivered_push_at IS NOT NULL FROM notification") == [(True,)]


@pytest.mark.db
def test_late_reminders_stay_in_the_app_and_dropped_subscriptions_end(
    people: People, push_service: FakePushService
) -> None:
    ada = people.as_("ada")
    browser = Browser()
    people.api.post(
        "/api/v1/me/push-subscriptions", json=browser.subscription(push_service.endpoint("a")), headers=ada
    )
    series = _event(people, ada, rrule="FREQ=DAILY", start_date="2026-11-02", end_date="2026-11-02")
    _reminder(people, ada, series, offset_minutes=15)
    settings = make_settings(database_url=people.db_url)

    _run(people, utc(2026, 11, 3, 12), settings)
    assert _run(people, utc(2026, 11, 4, 12), settings) == {
        "fired_late": 1
    }  # 07:45 UTC was due: 4 hours late
    assert push_service.received == []

    push_service.status = 410  # the browser dropped the subscription
    assert _run(people, utc(2026, 11, 5, 9, 45), settings) == {"fired": 1}
    assert len(push_service.received) == 1
    assert _as(people, "ada", "SELECT revoke_reason FROM push_subscription") == [("gone",)]
    _run(people, utc(2026, 11, 6, 9, 45), settings)
    assert len(push_service.received) == 1  # nothing more to a revoked subscription
