"""Account lockout, admin unlock, TOTP two-factor login, recovery codes, admin 2FA policy (marker `db`).

+++===+++ 2026-10-15 — Hasan Alizada — HAAL-162.
"""

from __future__ import annotations

import time
from pathlib import Path

import pyotp
import pytest
from fastapi.testclient import TestClient

from haalendar.main import create_app

from .account_helpers import PASSWORD, create_user, login, sql
from .conftest import make_settings

pytestmark = pytest.mark.db

WRONG = "definitely-not-the-password"


def _csrf(body: dict[str, object]) -> dict[str, str]:
    token = body["csrf_token"]
    assert isinstance(token, str)
    return {"X-CSRF-Token": token}


def _login_full(api: TestClient, address: str, **extra: str) -> tuple[int, dict[str, object]]:
    response = api.post("/api/v1/auth/login", json={"email": address, "password": PASSWORD, **extra})
    return response.status_code, response.json()


def _enable_totp(api: TestClient, headers: dict[str, str]) -> tuple[pyotp.TOTP, list[str]]:
    setup = api.post("/api/v1/me/totp/setup", headers=headers)
    assert setup.status_code == 200
    secret = setup.json()["secret"]
    assert setup.json()["otpauth_uri"].startswith("otpauth://totp/Haalendar:")
    totp = pyotp.TOTP(secret)
    assert api.post("/api/v1/me/totp/enable", json={"totp_code": "000000"}, headers=headers).status_code in (
        422,
        200,
    )
    enabled = api.post("/api/v1/me/totp/enable", json={"totp_code": totp.now()}, headers=headers)
    if enabled.status_code == 409:  # "000000" happened to be the valid code
        pytest.skip("random collision with code 000000")
    assert enabled.status_code == 200
    codes = enabled.json()["recovery_codes"]
    assert len(codes) == 10 and len(set(codes)) == 10
    return totp, codes


def _next_code(totp: pyotp.TOTP) -> str:
    """Code of the next 30 s step: valid within the ±1 window and newer than the enrolment step."""
    return totp.at(int(time.time()) + 30)


# ---------- lockout ----------


def test_fifth_failure_locks_account_with_retry_after(api: TestClient, clean_db: str) -> None:
    create_user(api, clean_db, "ann@example.org")
    statuses = [login(api, "ann@example.org", WRONG)[0] for _ in range(5)]
    assert statuses == [401] * 5
    locked = api.post("/api/v1/auth/login", json={"email": "ann@example.org", "password": PASSWORD})
    assert locked.status_code == 429
    assert locked.json()["code"] == "account_locked"
    assert 800 <= int(locked.headers["retry-after"]) <= 901  # about 15 minutes
    assert sql(clean_db, "SELECT failed_login_count FROM user_account") == [
        (5,)
    ]  # attempts while locked not counted

    sql(clean_db, "UPDATE user_account SET locked_until = now() - interval '1 second'")
    assert login(api, "ann@example.org")[0] == 200
    assert sql(clean_db, "SELECT failed_login_count, locked_until FROM user_account") == [(0, None)]


def test_lock_grows_on_repeated_series(api: TestClient, clean_db: str) -> None:
    create_user(api, clean_db, "bob@example.org")
    sql(clean_db, "UPDATE user_account SET failed_login_count = 9")
    login(api, "bob@example.org", WRONG)  # 10th failure
    minutes = sql(clean_db, "SELECT round(extract(epoch FROM locked_until - now()) / 60) FROM user_account")[
        0
    ][0]
    assert 29 <= float(str(minutes)) <= 30


def test_admin_unlock(api: TestClient, clean_db: str) -> None:
    create_user(api, clean_db, "root@example.org", role="admin")
    create_user(api, clean_db, "cy@example.org")
    cy_id = sql(clean_db, "SELECT id FROM user_account WHERE email = 'cy@example.org'")[0][0]
    sql(
        clean_db,
        "UPDATE user_account SET failed_login_count = 5, locked_until = now() + interval '15 minutes' "
        "WHERE email = 'cy@example.org'",
    )
    assert login(api, "cy@example.org")[0] == 429
    _, admin = login(api, "root@example.org")
    assert api.post(f"/api/v1/admin/users/{cy_id}/unlock", headers=_csrf(admin)).status_code == 200
    assert login(api, "cy@example.org")[0] == 200


# ---------- TOTP ----------


def test_totp_login_requires_valid_unused_code(api: TestClient, clean_db: str, mail_dir: Path) -> None:
    create_user(api, clean_db, "dee@example.org")
    _, body = login(api, "dee@example.org")
    totp, _codes = _enable_totp(api, _csrf(body))

    status, missing = _login_full(api, "dee@example.org")
    assert (status, missing["code"]) == (401, "totp_required")
    status, wrong = _login_full(
        api, "dee@example.org", totp_code="123456" if totp.now() != "123456" else "654321"
    )
    assert (status, wrong["code"]) == (401, "invalid_credentials")
    code = _next_code(totp)
    assert _login_full(api, "dee@example.org", totp_code=code)[0] == 200
    assert _login_full(api, "dee@example.org", totp_code=code)[0] == 401  # replay of the same step

    stored = sql(clean_db, "SELECT totp_secret_enc FROM user_account")[0][0]
    assert isinstance(stored, str) and stored.startswith("v1:") and totp.secret not in stored


def test_recovery_code_works_once(api: TestClient, clean_db: str) -> None:
    create_user(api, clean_db, "eve@example.org")
    _, body = login(api, "eve@example.org")
    _totp, codes = _enable_totp(api, _csrf(body))
    assert _login_full(api, "eve@example.org", recovery_code=codes[0].upper())[0] == 200
    assert _login_full(api, "eve@example.org", recovery_code=codes[0])[0] == 401


def test_disable_totp_requires_recent_reauth(api: TestClient, clean_db: str) -> None:
    create_user(api, clean_db, "fay@example.org")
    _, body = login(api, "fay@example.org")
    headers = _csrf(body)
    totp, _ = _enable_totp(api, headers)
    sql(clean_db, "UPDATE session SET reauth_at = now() - interval '1 hour'")
    stale = api.post("/api/v1/me/totp/disable", headers=headers)
    assert stale.status_code == 403 and stale.json()["code"] == "reauth_required"
    assert api.post("/api/v1/auth/reauth", json={"password": PASSWORD}, headers=headers).status_code == 204
    assert api.post("/api/v1/me/totp/disable", headers=headers).status_code == 204
    assert login(api, "fay@example.org")[0] == 200  # no second factor any more
    assert totp is not None


def test_instance_can_require_2fa_for_admins(api: TestClient, clean_db: str) -> None:
    create_user(api, clean_db, "boss@example.org", role="admin")
    create_user(api, clean_db, "gil@example.org")
    gil_id = sql(clean_db, "SELECT id FROM user_account WHERE email = 'gil@example.org'")[0][0]
    sql(clean_db, "UPDATE instance_settings SET require_admin_2fa = true")

    _, boss = login(api, "boss@example.org")
    headers = _csrf(boss)
    blocked = api.post(f"/api/v1/admin/users/{gil_id}/unlock", headers=headers)
    assert blocked.status_code == 403 and blocked.json()["code"] == "totp_required"

    _enable_totp(api, headers)
    assert api.post(f"/api/v1/admin/users/{gil_id}/unlock", headers=headers).status_code == 200
    refused = api.post("/api/v1/me/totp/disable", headers=headers)
    assert refused.status_code == 403 and refused.json()["code"] == "forbidden"


# ---------- auth endpoint rate limit ----------


def test_auth_endpoints_have_a_stricter_rate_limit(clean_db: str, mail_dir: Path) -> None:
    settings = make_settings(
        database_url=clean_db,
        mail_dir=str(mail_dir),
        auth_rate_limit_per_minute="3",
        auth_rate_limit_burst="3",
    )
    with TestClient(create_app(settings), base_url="https://testserver") as api:
        statuses = [login(api, "nobody@example.org", WRONG)[0] for _ in range(4)]
        health = api.get("/api/v1/health/live").status_code
    assert statuses == [401, 401, 401, 429]
    assert health == 200
