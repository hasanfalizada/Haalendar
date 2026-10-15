"""Registration, e-mail verification, login, sessions, CSRF and logout against PostgreSQL (marker `db`).

+++===+++ 2026-10-15 — Hasan Alizada — HAAL-160. The client talks to https://testserver so that the Secure
__Host- session cookie is sent back, exactly like a browser on an HTTPS instance.
"""

from __future__ import annotations

import asyncio
import email
import re
from collections.abc import Iterator
from pathlib import Path

import psycopg
import pytest
from fastapi.testclient import TestClient
from sqlalchemy.engine import make_url
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from haalendar.accounts import service
from haalendar.deps import SESSION_COOKIE
from haalendar.main import create_app

from .conftest import make_settings

pytestmark = pytest.mark.db

PASSWORD = "quiet-mountain-river-42"
TZ = "Europe/Berlin"


def _sql(db_url: str, statement: str, *params: object) -> list[tuple[object, ...]]:
    url = make_url(db_url).set(drivername="postgresql").render_as_string(hide_password=False)
    with psycopg.connect(url, autocommit=True) as conn:
        cursor = conn.execute(statement, params or None)
        return cursor.fetchall() if cursor.description else []


def _invite(db_url: str, address: str, role: str = "user") -> str:
    async def run() -> str:
        engine = create_async_engine(db_url)
        try:
            async with async_sessionmaker(engine)() as db:
                token = await service.create_invite(db, address, role)
                await db.commit()
                return token
        finally:
            await engine.dispose()

    return asyncio.run(run())


@pytest.fixture
def mail_dir(tmp_path: Path) -> Path:
    return tmp_path / "mail"


@pytest.fixture
def api(clean_db: str, mail_dir: Path) -> Iterator[TestClient]:
    app = create_app(make_settings(database_url=clean_db, mail_dir=str(mail_dir)))
    with TestClient(app, base_url="https://testserver", raise_server_exceptions=False) as client:
        yield client


def _register(api: TestClient, address: str, invite: str | None = None, **extra: object) -> int:
    body: dict[str, object] = {
        "email": address,
        "password": PASSWORD,
        "display_name": "Test User",
        "time_zone": TZ,
    }
    if invite:
        body["invite_token"] = invite
    body.update(extra)
    return api.post("/api/v1/auth/register", json=body).status_code


def _login(api: TestClient, address: str, password: str = PASSWORD) -> tuple[int, dict[str, object]]:
    response = api.post("/api/v1/auth/login", json={"email": address, "password": password})
    return response.status_code, response.json() if response.content else {}


def _mails(mail_dir: Path) -> list[email.message.Message]:
    return [email.message_from_bytes(p.read_bytes()) for p in sorted(mail_dir.glob("*.eml"))]


def _link_token(message: email.message.Message) -> str:
    body = message.get_payload(decode=True)
    assert isinstance(body, bytes)
    found = re.search(r"token=([A-Za-z0-9_\-]+)", body.decode())
    assert found, body
    return found.group(1)


# ---------- invite-only (default) ----------


def test_registration_requires_invite_by_default(api: TestClient) -> None:
    response = api.post(
        "/api/v1/auth/register",
        json={"email": "a@example.org", "password": PASSWORD, "display_name": "A", "time_zone": TZ},
    )
    assert response.status_code == 403
    assert response.json()["code"] == "forbidden"


def test_invite_flow_login_me_logout(api: TestClient, clean_db: str) -> None:
    token = _invite(clean_db, "ann@example.org")
    assert _register(api, "Ann@Example.org", token) == 202

    status, body = _login(api, "ann@example.org")
    assert status == 200
    me = body["me"]
    assert isinstance(me, dict)
    assert me["email"] == "Ann@example.org"  # domain normalized to lower case, local part kept
    assert me["role"] == "user"
    csrf = body["csrf_token"]
    assert isinstance(csrf, str) and len(csrf) >= 32

    set_cookie = [c for c in api.cookies.jar if c.name == SESSION_COOKIE]
    assert len(set_cookie) == 1 and set_cookie[0].secure

    me_response = api.get("/api/v1/me")
    assert me_response.status_code == 200
    assert me_response.json()["csrf_token"] == csrf

    assert api.post("/api/v1/auth/logout").status_code == 403  # CSRF token missing
    assert api.post("/api/v1/auth/logout", headers={"X-CSRF-Token": "wrong"}).status_code == 403
    assert api.post("/api/v1/auth/logout", headers={"X-CSRF-Token": csrf}).status_code == 204
    assert api.get("/api/v1/me").status_code == 401


def test_invite_is_single_use_and_bound_to_email(api: TestClient, clean_db: str) -> None:
    token = _invite(clean_db, "bob@example.org")
    assert _register(api, "mallory@example.org", token) == 400
    assert _register(api, "bob@example.org", token) == 202
    assert _register(api, "bob@example.org", token) == 400


def test_invite_can_grant_admin_role(api: TestClient, clean_db: str) -> None:
    _register(api, "root@example.org", _invite(clean_db, "root@example.org", role="admin"))
    status, body = _login(api, "root@example.org")
    assert status == 200
    me = body["me"]
    assert isinstance(me, dict) and me["role"] == "admin"


# ---------- open registration with e-mail verification ----------


def test_open_registration_requires_email_verification(
    api: TestClient, clean_db: str, mail_dir: Path
) -> None:
    _sql(clean_db, "UPDATE instance_settings SET registration_mode = 'open'")
    assert _register(api, "carl@example.org") == 202

    assert _login(api, "carl@example.org")[0] == 403  # not verified yet
    messages = _mails(mail_dir)
    assert len(messages) == 1 and messages[0]["To"] == "carl@example.org"
    token = _link_token(messages[0])

    assert api.post("/api/v1/auth/verify-email", json={"token": token}).status_code == 204
    assert api.post("/api/v1/auth/verify-email", json={"token": token}).status_code == 400  # single use
    assert _login(api, "carl@example.org")[0] == 200


def test_duplicate_registration_is_indistinguishable(api: TestClient, clean_db: str, mail_dir: Path) -> None:
    _sql(clean_db, "UPDATE instance_settings SET registration_mode = 'open'")
    assert _register(api, "dora@example.org") == 202
    assert _register(api, "DORA@example.org") == 202
    assert _sql(clean_db, "SELECT count(*) FROM user_account") == [(1,)]
    subjects = [m["Subject"] for m in _mails(mail_dir)]
    assert subjects == ["Haalendar: confirm your e-mail address", "Haalendar: registration attempt"]


# ---------- validation ----------


def test_weak_password_reports_all_violations(api: TestClient, clean_db: str) -> None:
    _sql(clean_db, "UPDATE instance_settings SET registration_mode = 'open'")
    response = api.post(
        "/api/v1/auth/register",
        json={
            "email": "eve.long@example.org",
            "password": "eve.long",
            "display_name": "Eve",
            "time_zone": TZ,
        },
    )
    assert response.status_code == 422
    codes = [e["code"] for e in response.json()["errors"]]
    assert codes == ["too_short", "contains_email"]
    assert all(e["pointer"] == "/password" for e in response.json()["errors"])


def test_unknown_time_zone_and_unknown_fields_are_rejected(api: TestClient, clean_db: str) -> None:
    _sql(clean_db, "UPDATE instance_settings SET registration_mode = 'open'")
    assert _register(api, "f@example.org", time_zone="Mars/Olympus") == 422
    assert _register(api, "g@example.org", role="admin") == 422


# ---------- login failures and sessions ----------


def test_wrong_password_and_unknown_email_look_the_same(api: TestClient, clean_db: str) -> None:
    _register(api, "hank@example.org", _invite(clean_db, "hank@example.org"))
    wrong_status, wrong = _login(api, "hank@example.org", "not-the-right-password-at-all")
    unknown_status, unknown = _login(api, "nobody@example.org")
    assert wrong_status == unknown_status == 401
    assert wrong["code"] == unknown["code"] == "invalid_credentials"
    assert wrong["detail"] == unknown["detail"]
    assert _sql(clean_db, "SELECT failed_login_count FROM user_account") == [(1,)]


def test_expired_session_is_rejected(api: TestClient, clean_db: str) -> None:
    _register(api, "ivy@example.org", _invite(clean_db, "ivy@example.org"))
    assert _login(api, "ivy@example.org")[0] == 200
    assert api.get("/api/v1/me").status_code == 200
    _sql(clean_db, "UPDATE session SET idle_expires_at = now() - interval '1 minute'")
    response = api.get("/api/v1/me")
    assert response.status_code == 401
    assert response.json()["code"] == "session_expired"


def test_secrets_are_stored_only_as_hashes(api: TestClient, clean_db: str) -> None:
    _register(api, "jo@example.org", _invite(clean_db, "jo@example.org"))
    _login(api, "jo@example.org")
    cookie = next(c.value for c in api.cookies.jar if c.name == SESSION_COOKIE)
    assert cookie is not None
    rows = _sql(
        clean_db,
        "SELECT u.password_hash, s.token_hash FROM user_account u JOIN session s ON s.user_id = u.id",
    )
    password_hash, token_hash = rows[0]
    assert isinstance(password_hash, str) and password_hash.startswith("$argon2id$")
    assert token_hash != cookie and len(str(token_hash)) == 64


def test_logs_never_contain_passwords_or_tokens(
    api: TestClient, clean_db: str, caplog: pytest.LogCaptureFixture
) -> None:
    invite = _invite(clean_db, "kim@example.org")
    caplog.clear()
    _register(api, "kim@example.org", invite)
    _, body = _login(api, "kim@example.org")
    out = caplog.text
    assert PASSWORD not in out
    assert invite not in out
    assert str(body["csrf_token"]) not in out
    assert "kim@example.org" not in out
    assert "login_succeeded" in out
