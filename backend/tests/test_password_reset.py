"""Password reset, re-authentication, password change and admin reset against PostgreSQL (marker `db`).

+++===+++ 2026-10-15 — Hasan Alizada — HAAL-161.
"""

from __future__ import annotations

from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from haalendar.main import create_app

from .account_helpers import PASSWORD, create_user, link_token, login, mails, sql
from .conftest import make_settings

pytestmark = pytest.mark.db

NEW_PASSWORD = "silver-lantern-orchard-77"


def _request_reset(api: TestClient, address: str) -> int:
    return api.post("/api/v1/auth/password-reset/request", json={"email": address}).status_code


def _confirm(api: TestClient, token: str, new_password: str = NEW_PASSWORD) -> int:
    response = api.post(
        "/api/v1/auth/password-reset/confirm", json={"token": token, "new_password": new_password}
    )
    return response.status_code


def _csrf(body: dict[str, object]) -> str:
    value = body["csrf_token"]
    assert isinstance(value, str)
    return value


# ---------- reset by e-mail ----------


def test_reset_flow_changes_password_and_revokes_sessions(
    api: TestClient, clean_db: str, mail_dir: Path
) -> None:
    create_user(api, clean_db, "ann@example.org")
    assert login(api, "ann@example.org")[0] == 200
    assert api.get("/api/v1/me").status_code == 200

    assert _request_reset(api, "ann@example.org") == 202
    reset_mail = mails(mail_dir)[-1]
    assert reset_mail["Subject"] == "Haalendar: reset your password"
    assert _confirm(api, link_token(reset_mail)) == 204

    assert api.get("/api/v1/me").status_code == 401  # old session revoked
    assert login(api, "ann@example.org", PASSWORD)[0] == 401
    assert login(api, "ann@example.org", NEW_PASSWORD)[0] == 200
    assert mails(mail_dir)[-1]["Subject"] == "Haalendar: your password was changed"


def test_reset_link_is_single_use_and_expires(api: TestClient, clean_db: str, mail_dir: Path) -> None:
    create_user(api, clean_db, "bob@example.org")
    _request_reset(api, "bob@example.org")
    token = link_token(mails(mail_dir)[-1])
    assert _confirm(api, token) == 204
    assert _confirm(api, token, "another-good-passphrase-1") == 400

    sql(clean_db, "UPDATE auth_token SET created_at = now() - interval '10 minutes'")
    _request_reset(api, "bob@example.org")
    expired = link_token(mails(mail_dir)[-1])
    sql(clean_db, "UPDATE auth_token SET expires_at = now() - interval '1 second' WHERE used_at IS NULL")
    assert _confirm(api, expired) == 400


def test_new_link_supersedes_old_one(api: TestClient, clean_db: str, mail_dir: Path) -> None:
    create_user(api, clean_db, "cy@example.org")
    _request_reset(api, "cy@example.org")
    first = link_token(mails(mail_dir)[-1])
    sql(clean_db, "UPDATE auth_token SET created_at = now() - interval '10 minutes'")
    _request_reset(api, "cy@example.org")
    second = link_token(mails(mail_dir)[-1])
    assert _confirm(api, first) == 400
    assert _confirm(api, second) == 204


def test_unknown_email_and_throttling_send_nothing_extra(
    api: TestClient, clean_db: str, mail_dir: Path
) -> None:
    assert _request_reset(api, "nobody@example.org") == 202
    assert mails(mail_dir) == []
    create_user(api, clean_db, "dee@example.org")
    assert _request_reset(api, "dee@example.org") == 202
    assert _request_reset(api, "dee@example.org") == 202  # within 5 minutes: throttled
    assert len([m for m in mails(mail_dir) if m["Subject"] == "Haalendar: reset your password"]) == 1


def test_deactivated_account_gets_no_link(api: TestClient, clean_db: str, mail_dir: Path) -> None:
    create_user(api, clean_db, "eli@example.org")
    sql(clean_db, "UPDATE user_account SET deactivated_at = now()")
    assert _request_reset(api, "eli@example.org") == 202
    assert mails(mail_dir) == []


def test_new_password_must_meet_policy(api: TestClient, clean_db: str, mail_dir: Path) -> None:
    create_user(api, clean_db, "fay@example.org")
    _request_reset(api, "fay@example.org")
    response = api.post(
        "/api/v1/auth/password-reset/confirm",
        json={"token": link_token(mails(mail_dir)[-1]), "new_password": "short"},
    )
    assert response.status_code == 422
    assert response.json()["errors"][0]["pointer"] == "/new_password"


# ---------- re-authentication and password change ----------


def test_reauth_and_change_password(api: TestClient, clean_db: str) -> None:
    create_user(api, clean_db, "gil@example.org")
    _, body = login(api, "gil@example.org")
    csrf = _csrf(body)
    headers = {"X-CSRF-Token": csrf}

    sql(clean_db, "UPDATE session SET reauth_at = now() - interval '16 minutes'")
    change = api.post("/api/v1/me/password", json={"new_password": NEW_PASSWORD}, headers=headers)
    assert change.status_code == 403
    assert change.json()["code"] == "reauth_required"

    assert (
        api.post(
            "/api/v1/auth/reauth", json={"password": "wrong-password-value"}, headers=headers
        ).status_code
        == 401
    )
    assert api.post("/api/v1/auth/reauth", json={"password": PASSWORD}, headers=headers).status_code == 204
    assert (
        api.post("/api/v1/me/password", json={"new_password": NEW_PASSWORD}, headers=headers).status_code
        == 204
    )
    assert api.get("/api/v1/me").status_code == 200  # current session kept
    assert login(api, "gil@example.org", NEW_PASSWORD)[0] == 200


def test_change_password_revokes_other_sessions(api: TestClient, clean_db: str) -> None:
    create_user(api, clean_db, "hal@example.org")
    login(api, "hal@example.org")  # session A (will be overwritten in the client jar)
    other_sessions_before = sql(clean_db, "SELECT count(*) FROM session WHERE revoked_at IS NULL")
    _, body = login(api, "hal@example.org")  # session B (current)
    api.post(
        "/api/v1/me/password", json={"new_password": NEW_PASSWORD}, headers={"X-CSRF-Token": _csrf(body)}
    )
    assert other_sessions_before == [(1,)]
    assert sql(clean_db, "SELECT count(*) FROM session WHERE revoked_at IS NULL") == [(1,)]


# ---------- admin reset ----------


def test_admin_reset_without_smtp_returns_one_time_password(api: TestClient, clean_db: str) -> None:
    create_user(api, clean_db, "admin@example.org", role="admin")
    create_user(api, clean_db, "ivy@example.org")
    user_id = sql(clean_db, "SELECT id FROM user_account WHERE email = 'ivy@example.org'")[0][0]

    _, admin = login(api, "admin@example.org")
    response = api.post(
        f"/api/v1/admin/users/{user_id}/reset-password", headers={"X-CSRF-Token": _csrf(admin)}
    )
    assert response.status_code == 200
    body = response.json()
    assert body["delivery"] == "one_time_password"
    one_time = body["one_time_password"]
    assert isinstance(one_time, str) and len(one_time) >= 15

    status, user = login(api, "ivy@example.org", one_time)
    assert status == 200
    me = user["me"]
    assert isinstance(me, dict) and me["must_change_password"] is True
    user_headers = {"X-CSRF-Token": _csrf(user)}
    assert api.get("/api/v1/me").status_code == 200  # allowed while the change is pending
    blocked = api.post(f"/api/v1/admin/users/{user_id}/reset-password", headers=user_headers)
    assert blocked.json()["code"] == "password_change_required"
    assert (
        api.post("/api/v1/me/password", json={"new_password": NEW_PASSWORD}, headers=user_headers).status_code
        == 204
    )
    assert api.get("/api/v1/me").json()["must_change_password"] is False


def test_admin_reset_requires_admin_and_recent_reauth(api: TestClient, clean_db: str) -> None:
    create_user(api, clean_db, "root@example.org", role="admin")
    create_user(api, clean_db, "joe@example.org")
    joe_id = sql(clean_db, "SELECT id FROM user_account WHERE email = 'joe@example.org'")[0][0]

    _, joe = login(api, "joe@example.org")
    denied = api.post(f"/api/v1/admin/users/{joe_id}/reset-password", headers={"X-CSRF-Token": _csrf(joe)})
    assert denied.status_code == 403 and denied.json()["code"] == "forbidden"

    _, root = login(api, "root@example.org")
    sql(clean_db, "UPDATE session SET reauth_at = now() - interval '1 hour'")
    stale = api.post(f"/api/v1/admin/users/{joe_id}/reset-password", headers={"X-CSRF-Token": _csrf(root)})
    assert stale.status_code == 403 and stale.json()["code"] == "reauth_required"


def test_admin_reset_with_smtp_sends_link(
    clean_db: str, mail_dir: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    sent: list[tuple[str, str]] = []

    async def fake_send(self: object, to: str, subject: str, body: str) -> bool:
        sent.append((to, subject))
        return True

    monkeypatch.setattr("haalendar.accounts.mailer.SmtpMailer.send", fake_send)
    app = create_app(
        make_settings(database_url=clean_db, smtp_host="smtp.example.org", mail_dir=str(mail_dir))
    )
    with TestClient(app, base_url="https://testserver", raise_server_exceptions=False) as api:
        create_user(api, clean_db, "boss@example.org", role="admin")
        create_user(api, clean_db, "kay@example.org")
        kay_id = sql(clean_db, "SELECT id FROM user_account WHERE email = 'kay@example.org'")[0][0]
        _, boss = login(api, "boss@example.org")
        response = api.post(
            f"/api/v1/admin/users/{kay_id}/reset-password", headers={"X-CSRF-Token": _csrf(boss)}
        )
    assert response.status_code == 200
    assert response.json() == {"delivery": "email", "one_time_password": None}
    assert ("kay@example.org", "Haalendar: reset your password") in sent
