"""Self-service completed in HAAL-171: verification resend, recovery-code regeneration, own sessions, instance
settings (marker `db`).

+++===+++ 2026-10-15 — Hasan Alizada — HAAL-171.
"""

from __future__ import annotations

from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from haalendar.accounts.service import device_summary

from .account_helpers import PASSWORD, create_user, link_token, login, mails, register, sql
from .test_login_protection import _csrf, _enable_totp, _login_full

pytestmark = pytest.mark.db

MERGE = "application/merge-patch+json"


def _open_registration(db_url: str) -> None:
    sql(db_url, "UPDATE instance_settings SET registration_mode = 'open'")


# ---------- verification resend ----------


def test_resend_is_generic_throttled_and_supersedes_old_links(
    api: TestClient, clean_db: str, mail_dir: Path
) -> None:
    _open_registration(clean_db)
    assert register(api, "val@example.org") == 202
    first = link_token(mails(mail_dir)[-1])

    def resend(address: str) -> int:
        return api.post("/api/v1/auth/verify-email/resend", json={"email": address}).status_code

    assert resend("val@example.org") == 202
    assert len(mails(mail_dir)) == 1  # throttled: the first link is younger than 5 minutes
    sql(clean_db, "UPDATE auth_token SET created_at = now() - interval '6 minutes'")
    assert resend("VAL@example.org") == 202
    assert len(mails(mail_dir)) == 2
    second = link_token(mails(mail_dir)[-1])

    assert api.post("/api/v1/auth/verify-email", json={"token": first}).status_code == 400  # superseded
    assert api.post("/api/v1/auth/verify-email", json={"token": second}).status_code == 204
    assert login(api, "val@example.org")[0] == 200

    sql(clean_db, "UPDATE auth_token SET created_at = now() - interval '6 minutes'")
    assert resend("val@example.org") == 202  # already verified: nothing sent
    assert resend("nobody@example.org") == 202
    assert len(mails(mail_dir)) == 2


# ---------- recovery codes ----------


def test_regenerate_recovery_codes(api: TestClient, clean_db: str) -> None:
    create_user(api, clean_db, "rex@example.org")
    _, body = login(api, "rex@example.org")
    headers = _csrf(body)
    assert api.post("/api/v1/me/totp/recovery-codes", headers=headers).status_code == 409  # 2FA off

    _, old_codes = _enable_totp(api, headers)
    sql(clean_db, "UPDATE session SET reauth_at = now() - interval '1 hour'")
    stale = api.post("/api/v1/me/totp/recovery-codes", headers=headers)
    assert stale.status_code == 403 and stale.json()["code"] == "reauth_required"
    sql(clean_db, "UPDATE session SET reauth_at = now()")
    fresh = api.post("/api/v1/me/totp/recovery-codes", headers=headers)
    assert fresh.status_code == 200
    new_codes = fresh.json()["recovery_codes"]
    assert len(new_codes) == 10 and not set(new_codes) & set(old_codes)

    assert _login_full(api, "rex@example.org", recovery_code=old_codes[0])[0] == 401
    assert _login_full(api, "rex@example.org", recovery_code=new_codes[0])[0] == 200


# ---------- sessions ----------


def test_list_and_revoke_own_sessions(api: TestClient, clean_db: str) -> None:
    create_user(api, clean_db, "sam@example.org")
    create_user(api, clean_db, "tia@example.org")
    assert login(api, "tia@example.org")[0] == 200
    tia_session = sql(clean_db, "SELECT id FROM session WHERE revoked_at IS NULL")[0][0]

    other = TestClient(
        api.app,
        base_url="https://testserver",
        headers={"User-Agent": "Mozilla/5.0 (Linux; Android 15) Chrome/140.0 Mobile"},
    )
    assert (
        other.post("/api/v1/auth/login", json={"email": "sam@example.org", "password": PASSWORD}).status_code
        == 200
    )
    status, body = login(api, "sam@example.org")
    assert status == 200
    headers = _csrf(body)

    listed = api.get("/api/v1/me/sessions").json()["data"]
    assert len(listed) == 2
    assert [s["current"] for s in listed].count(True) == 1
    phone = next(s for s in listed if not s["current"])
    assert phone["device"] == "Chrome on Android"

    assert api.delete(f"/api/v1/me/sessions/{tia_session}", headers=headers).status_code == 404  # not mine
    assert api.delete(f"/api/v1/me/sessions/{phone['id']}", headers=headers).status_code == 204
    assert other.get("/api/v1/me").status_code == 401

    assert (
        other.post("/api/v1/auth/login", json={"email": "sam@example.org", "password": PASSWORD}).status_code
        == 200
    )
    assert api.post("/api/v1/me/sessions/revoke-others", headers=headers).status_code == 204
    assert other.get("/api/v1/me").status_code == 401
    assert api.get("/api/v1/me").status_code == 200


def test_device_summary() -> None:
    assert (
        device_summary(
            "Mozilla/5.0 (Windows NT 10.0; Win64) AppleWebKit Chrome/140.0 Safari/537.36 Edg/140.0"
        )
        == "Edge on Windows"
    )
    assert (
        device_summary("Mozilla/5.0 (Macintosh; Intel Mac OS X 14_6) Version/18.0 Safari/605.1.15")
        == "Safari on macOS"
    )
    assert device_summary("Mozilla/5.0 (X11; Linux x86_64; rv:131.0) Firefox/131.0") == "Firefox on Linux"
    assert device_summary(None) == "Browser"


# ---------- instance settings ----------


def test_instance_settings(api: TestClient, clean_db: str) -> None:
    create_user(api, clean_db, "boss@example.org", role="admin")
    _, body = login(api, "boss@example.org")
    headers = {**_csrf(body), "Content-Type": MERGE}

    current = api.get("/api/v1/admin/settings").json()
    assert current == {
        "registration_mode": "invite",
        "require_admin_2fa": False,
        "demo_mode": False,
        "smtp_configured": False,
        "version": current["version"],
    }
    version = current["version"]
    assert (
        api.patch("/api/v1/admin/settings", json={"registration_mode": "open"}, headers=headers).status_code
        == 428
    )
    stale = api.patch(
        "/api/v1/admin/settings",
        json={"registration_mode": "open"},
        headers={**headers, "If-Match": f'"{version + 5}"'},
    )
    assert stale.status_code == 412
    opened = api.patch(
        "/api/v1/admin/settings",
        json={"registration_mode": "open"},
        headers={**headers, "If-Match": f'"{version}"'},
    )
    assert opened.status_code == 200 and opened.json()["registration_mode"] == "open"
    assert opened.headers["ETag"] == f'"{version + 1}"'
    assert register(api, "walkin@example.org") == 202  # no invitation needed now

    _, body = login(api, "boss@example.org")
    headers = {**_csrf(body), "Content-Type": MERGE}
    lockout = api.patch(
        "/api/v1/admin/settings",
        json={"require_admin_2fa": True},
        headers={**headers, "If-Match": f'"{version + 1}"'},
    )
    assert lockout.status_code == 409  # the acting admin has no 2FA yet
    _enable_totp(api, _csrf(body))
    enforced = api.patch(
        "/api/v1/admin/settings",
        json={"require_admin_2fa": True},
        headers={**headers, "If-Match": f'"{version + 1}"'},
    )
    assert enforced.status_code == 200 and enforced.json()["require_admin_2fa"] is True


def test_instance_settings_need_admin_and_reauth(api: TestClient, clean_db: str) -> None:
    create_user(api, clean_db, "joe@example.org")
    _, body = login(api, "joe@example.org")
    assert api.get("/api/v1/admin/settings").status_code == 403

    create_user(api, clean_db, "root@example.org", role="admin")
    _, body = login(api, "root@example.org")
    sql(clean_db, "UPDATE session SET reauth_at = now() - interval '1 hour'")
    response = api.patch(
        "/api/v1/admin/settings",
        json={"registration_mode": "open"},
        headers={**_csrf(body), "Content-Type": MERGE, "If-Match": '"1"'},
    )
    assert response.status_code == 403 and response.json()["code"] == "reauth_required"
