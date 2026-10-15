"""First-run admin setup and the last-admin guard (marker `db`).

+++===+++ 2026-10-15 — Hasan Alizada — HAAL-163.
"""

from __future__ import annotations

import asyncio
import uuid
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from haalendar.accounts import service
from haalendar.errors import ProblemError
from haalendar.main import create_app

from .account_helpers import PASSWORD, TZ, create_user, sql
from .conftest import make_settings

pytestmark = pytest.mark.db

ADMIN = {"email": "owner@example.org", "password": PASSWORD, "display_name": "Owner", "time_zone": TZ}


def _client(db_url: str, mail_dir: Path, **settings: str) -> TestClient:
    return TestClient(
        create_app(make_settings(database_url=db_url, mail_dir=str(mail_dir), **settings)),
        base_url="https://testserver",
        raise_server_exceptions=False,
    )


def test_setup_creates_signed_in_admin_once(api: TestClient, clean_db: str) -> None:
    status = api.get("/api/v1/setup/status").json()
    assert status == {
        "setup_required": True,
        "setup_token_required": False,
        "registration_mode": "invite",
        "demo_mode": False,
    }

    created = api.post("/api/v1/setup/admin", json=ADMIN)
    assert created.status_code == 201
    me = created.json()
    assert me["role"] == "admin" and me["email"] == "owner@example.org" and me["csrf_token"]
    assert api.get("/api/v1/me").json()["role"] == "admin"  # session cookie set
    assert sql(clean_db, "SELECT email_verified_at IS NOT NULL FROM user_account") == [(True,)]

    assert api.get("/api/v1/setup/status").json()["setup_required"] is False
    again = api.post("/api/v1/setup/admin", json={**ADMIN, "email": "second@example.org"})
    assert again.status_code == 409 and again.json()["code"] == "invalid_state"


def test_setup_validates_password_and_time_zone(api: TestClient) -> None:
    weak = api.post("/api/v1/setup/admin", json={**ADMIN, "password": "short"})
    assert weak.status_code == 422 and weak.json()["errors"][0]["pointer"] == "/password"
    zone = api.post("/api/v1/setup/admin", json={**ADMIN, "time_zone": "Nowhere/City"})
    assert zone.status_code == 422


def test_setup_token_is_enforced_when_configured(clean_db: str, mail_dir: Path) -> None:
    with _client(clean_db, mail_dir, setup_token="s" * 32) as api:
        assert api.get("/api/v1/setup/status").json()["setup_token_required"] is True
        missing = api.post("/api/v1/setup/admin", json=ADMIN)
        wrong = api.post("/api/v1/setup/admin", json={**ADMIN, "setup_token": "x" * 32})
        right = api.post("/api/v1/setup/admin", json={**ADMIN, "setup_token": "s" * 32})
    assert missing.status_code == wrong.status_code == 403
    assert right.status_code == 201


def test_production_without_setup_token_refuses_setup(clean_db: str, mail_dir: Path) -> None:
    settings = {"env": "production", "secret_key": "k" * 40, "public_url": "https://testserver"}
    with _client(clean_db, mail_dir, **settings) as api:
        assert api.get("/api/v1/setup/status").json()["setup_token_required"] is True
        refused = api.post("/api/v1/setup/admin", json=ADMIN)
    assert refused.status_code == 403
    assert "HAALENDAR_SETUP_TOKEN" in refused.json()["detail"]


def test_status_reports_open_registration_and_completed_setup(api: TestClient, clean_db: str) -> None:
    create_user(api, clean_db, "admin@example.org", role="admin")
    sql(clean_db, "UPDATE instance_settings SET registration_mode = 'open'")
    status = api.get("/api/v1/setup/status").json()
    assert status["setup_required"] is False and status["registration_mode"] == "open"


def test_last_admin_guard(api: TestClient, clean_db: str) -> None:
    create_user(api, clean_db, "a1@example.org", role="admin")
    a1 = sql(clean_db, "SELECT id FROM user_account WHERE email = 'a1@example.org'")[0][0]
    assert isinstance(a1, uuid.UUID)

    async def check(user_id: uuid.UUID) -> None:
        engine = create_async_engine(clean_db)
        try:
            async with async_sessionmaker(engine)() as db:
                await service.assert_not_last_admin(db, user_id)
        finally:
            await engine.dispose()

    with pytest.raises(ProblemError) as caught:
        asyncio.run(check(a1))
    assert caught.value.status == 409

    create_user(api, clean_db, "a2@example.org", role="admin")
    asyncio.run(check(a1))  # another active admin exists now
    sql(clean_db, "UPDATE user_account SET deactivated_at = now() WHERE email = 'a2@example.org'")
    with pytest.raises(ProblemError):
        asyncio.run(check(a1))  # deactivated admins do not count
