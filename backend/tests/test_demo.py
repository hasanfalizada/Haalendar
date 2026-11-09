"""The public demo (FR-OPS-03, D-103).

+++===+++ 2026-11-09 — Hasan Alizada — HAAL-154. The status, what is refused, the limits, the seed and, above all, that
the reset removes only a demo's data and refuses everything else.
"""

from __future__ import annotations

import uuid
from collections.abc import Iterator
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path

import psycopg
import pytest
import yaml
from fastapi.testclient import TestClient
from sqlalchemy.engine import make_url

from haalendar.accounts.mailer import DisabledMailer, create_mailer
from haalendar.config import Settings
from haalendar.demo import ALEX, MAX_UPLOAD_BYTES, MIRA, PASSWORD, REFUSED, is_refused, next_reset_at
from haalendar.demo import reset as reset_module
from haalendar.demo.reset import RefusedError, reset
from haalendar.main import create_app

from .conftest import make_settings
from .test_attachments import png

API = "/api/v1"


@pytest.mark.parametrize(
    ("now", "expected"),
    [
        ("2026-11-09T10:00:00", "2026-11-09T10:30:00"),
        ("2026-11-09T10:29:59", "2026-11-09T10:30:00"),
        ("2026-11-09T10:30:00", "2026-11-09T11:00:00"),
        ("2026-11-09T23:45:10", "2026-11-10T00:00:00"),
    ],
)
def test_the_next_reset_is_the_next_full_or_half_hour(now: str, expected: str) -> None:
    moment = datetime.fromisoformat(now).replace(tzinfo=UTC)
    assert next_reset_at(moment) == datetime.fromisoformat(expected).replace(tzinfo=UTC)


def test_outside_a_demo_the_status_says_only_that(client: TestClient) -> None:
    answer = client.get(f"{API}/demo/status").json()
    assert answer["demo_mode"] is False
    assert answer.get("next_reset_at") is None
    assert not answer.get("accounts")


def test_outside_a_demo_nothing_is_refused_by_the_demo_guard(api: TestClient) -> None:
    assert api.post(f"{API}/auth/register", json={}).status_code == 422


def test_the_refused_list_leaves_the_app_itself_alone() -> None:
    assert is_refused("POST", f"{API}/me/password")
    assert is_refused("DELETE", f"{API}/me/sessions/{uuid.uuid4()}")
    assert not is_refused("GET", f"{API}/me/sessions")
    assert not is_refused("POST", f"{API}/sync/push")
    assert not is_refused("POST", f"{API}/auth/login")


def test_a_demo_never_sends_mail_whatever_is_configured() -> None:
    settings = make_settings(demo_mode="true", smtp_host="mail.example.org")
    assert isinstance(create_mailer(settings), DisabledMailer)


@dataclass
class Stand:
    settings: Settings
    owner_url: str
    storage: Path

    def sql(self, statement: str, *params: object) -> list[tuple[object, ...]]:
        with psycopg.connect(self.owner_url, autocommit=True) as conn:
            cursor = conn.execute(statement, params or None)
            return cursor.fetchall() if cursor.description else []

    def client(self) -> TestClient:
        return TestClient(
            create_app(self.settings), base_url="https://testserver", raise_server_exceptions=False
        )


@pytest.fixture
def stand(owner_db_url: str, db_url: str, tmp_path: Path) -> Iterator[Stand]:
    """A database of its own, not migrated yet: as on the first start of the service."""
    name = f"haalendar_demo_{uuid.uuid4().hex[:12]}"
    owner = make_url(owner_db_url)
    admin = owner.set(drivername="postgresql", database="postgres").render_as_string(hide_password=False)
    with psycopg.connect(admin, autocommit=True) as conn:
        conn.execute(f'CREATE DATABASE "{name}"')
    settings = make_settings(
        database_url=make_url(db_url).set(database=name).render_as_string(hide_password=False),
        migration_database_url=owner.set(database=name).render_as_string(hide_password=False),
        demo_mode="true",
        storage_dir=str(tmp_path),
    )
    try:
        yield Stand(
            settings,
            owner.set(drivername="postgresql", database=name).render_as_string(hide_password=False),
            tmp_path,
        )
    finally:
        with psycopg.connect(admin, autocommit=True) as conn:
            for database in (name, f"{name}_demo_next", f"{name}_demo_old"):
                conn.execute(f'DROP DATABASE IF EXISTS "{database}" WITH (FORCE)')


def sign_in(api: TestClient, email: str = MIRA.email) -> dict[str, str]:
    answer = api.post(f"{API}/auth/login", json={"email": email, "password": PASSWORD})
    assert answer.status_code == 200, answer.text
    return {"X-CSRF-Token": answer.json()["csrf_token"]}


def pulled(api: TestClient) -> list[dict[str, object]]:
    changes: list[dict[str, object]] = []
    url = f"{API}/sync/pull"
    while True:
        page = api.get(url).json()
        changes += page["changes"]
        if not page["has_more"]:
            return changes
        url = f"{API}/sync/pull?since={page['cursor']}"


def titled(changes: list[dict[str, object]]) -> set[str]:
    return {str(c["data"].get("title")) for c in changes if c["entity_type"] == "item"}  # type: ignore[attr-defined]


def test_the_reset_fills_in_two_accounts_who_share_a_calendar_and_a_board(stand: Stand) -> None:
    reset(stand.settings)
    with stand.client() as api:
        sign_in(api)
        mira = pulled(api)
        assert {"Team stand-up", "Groceries", "Design the hero section", "Dentist"} <= titled(mira)
        api.cookies.clear()
        sign_in(api, ALEX.email)
        alex = pulled(api)
    assert {"Team stand-up", "Design the hero section", "Gym"} <= titled(alex)
    assert not {"Groceries", "Dentist"} & titled(alex), "Alex sees only what Mira shared"
    assert stand.sql("SELECT role FROM user_account GROUP BY role") == [("user",)]


def test_the_second_reset_removes_everything_and_devices_start_over(stand: Stand) -> None:
    reset(stand.settings)
    with stand.client() as api:
        csrf = sign_in(api)
        old_cursor = api.get(f"{API}/sync/pull").json()["cursor"]
        items = [c for c in pulled(api) if c["entity_type"] == "item" and c["data"]["title"] == "Groceries"]  # type: ignore[index]
        uploaded = api.post(
            f"{API}/items/{items[0]['entity_id']}/attachments",
            content=png(),
            headers={**csrf, "Content-Type": "image/png", "X-File-Name": "visitor.png"},
        )
        assert uploaded.status_code == 201, uploaded.text
        assert list(stand.storage.iterdir())
        oid_before = stand.sql("SELECT oid FROM pg_database WHERE datname = current_database()")

        reset(stand.settings)

        assert stand.sql("SELECT oid FROM pg_database WHERE datname = current_database()") != oid_before
        assert stand.sql("SELECT count(*) FROM attachment") == [(0,)]
        assert list(stand.storage.iterdir()) == []
        assert api.get(f"{API}/me").status_code == 401, "the visitor is signed out"
        sign_in(api)
        assert api.get(f"{API}/sync/pull", params={"since": old_cursor}).status_code == 410
        assert (
            stand.sql(
                "SELECT datname FROM pg_database WHERE datname LIKE '%%_demo_next' OR datname LIKE '%%_demo_old'"
            )
            == []
        )


def test_the_reset_refuses_a_database_with_any_other_account(stand: Stand) -> None:
    reset(stand.settings)
    stand.sql(
        "INSERT INTO user_account (id, email, password_hash, display_name, time_zone, role) "
        "VALUES (gen_random_uuid(), 'real@example.org', 'x', 'Real', 'UTC', 'user')"
    )
    (stand.storage / "kept.txt").write_text("real data")
    with pytest.raises(RefusedError):
        reset(stand.settings)
    with pytest.raises(RefusedError):
        reset_module.swap(stand.settings)
    assert stand.sql("SELECT count(*) FROM user_account WHERE email = 'real@example.org'") == [(1,)]
    assert (stand.storage / "kept.txt").exists()


def test_the_reset_refuses_without_demo_mode(stand: Stand) -> None:
    (stand.storage / "kept.txt").write_text("real data")
    with pytest.raises(RefusedError):
        reset(stand.settings.model_copy(update={"demo_mode": False}))
    assert (stand.storage / "kept.txt").exists()


def test_a_failed_build_leaves_the_stand_as_it_is(stand: Stand, monkeypatch: pytest.MonkeyPatch) -> None:
    reset(stand.settings)
    oid_before = stand.sql("SELECT oid FROM pg_database WHERE datname = current_database()")

    async def broken(*_args: object) -> None:
        raise RuntimeError("seed failed")

    monkeypatch.setattr(reset_module, "seed", broken)
    with pytest.raises(RuntimeError, match="seed failed"):
        reset(stand.settings)
    assert stand.sql("SELECT oid FROM pg_database WHERE datname = current_database()") == oid_before
    assert stand.sql("SELECT count(*) FROM user_account") == [(2,)]


@pytest.fixture
def demo_api(stand: Stand) -> Iterator[TestClient]:
    reset(stand.settings)
    with stand.client() as api:
        yield api


def test_the_status_tells_the_time_and_how_to_sign_in(demo_api: TestClient) -> None:
    answer = demo_api.get(f"{API}/demo/status").json()
    assert answer["demo_mode"] is True
    assert datetime.fromisoformat(answer["next_reset_at"]) > datetime.now(UTC)
    assert {a["email"] for a in answer["accounts"]} == {MIRA.email, ALEX.email}
    assert {a["password"] for a in answer["accounts"]} == {PASSWORD}


def test_a_demo_has_no_first_run_setup(demo_api: TestClient) -> None:
    assert demo_api.get(f"{API}/setup/status").json()["setup_required"] is False


@pytest.mark.parametrize(("method", "pattern"), REFUSED, ids=[p.pattern for _, p in REFUSED])
def test_a_demo_refuses_what_locks_others_out_or_sends_something(
    demo_api: TestClient, method: str, pattern: object
) -> None:
    sign_in(demo_api)
    path = pattern.pattern.strip("^$").replace("[^/]+", str(uuid.uuid4()))  # type: ignore[attr-defined]
    answer = demo_api.request(method, path, json={})
    assert answer.status_code == 403, answer.text
    assert answer.json()["detail"] == "This is not available in the demo"


def test_wrong_passwords_do_not_lock_a_demo_account(demo_api: TestClient, stand: Stand) -> None:
    for _ in range(12):
        wrong = demo_api.post(
            f"{API}/auth/login", json={"email": MIRA.email, "password": "wrong-password-here"}
        )
        assert wrong.status_code == 401
    assert stand.sql(
        "SELECT failed_login_count, locked_until FROM user_account WHERE email = %s", MIRA.email
    ) == [(0, None)]
    sign_in(demo_api)


def test_a_demo_takes_smaller_uploads(demo_api: TestClient) -> None:
    csrf = sign_in(demo_api)
    groceries = next(
        c["entity_id"]
        for c in pulled(demo_api)
        if c["entity_type"] == "item" and c["data"]["title"] == "Groceries"  # type: ignore[index]
    )
    headers = {**csrf, "Content-Type": "image/png", "X-File-Name": "big.png"}
    too_big = demo_api.post(
        f"{API}/items/{groceries}/attachments",
        content=b"\x89PNG\r\n\x1a\n" + b"0" * MAX_UPLOAD_BYTES,
        headers=headers,
    )
    assert too_big.status_code == 413
    fine = demo_api.post(f"{API}/items/{groceries}/attachments", content=png(), headers=headers)
    assert fine.status_code == 201, fine.text


def test_an_account_of_a_demo_has_a_limit_of_files(
    demo_api: TestClient, stand: Stand, monkeypatch: pytest.MonkeyPatch
) -> None:
    csrf = sign_in(demo_api)
    groceries = next(
        c["entity_id"]
        for c in pulled(demo_api)
        if c["entity_type"] == "item" and c["data"]["title"] == "Groceries"  # type: ignore[index]
    )
    headers = {**csrf, "Content-Type": "image/png", "X-File-Name": "a.png"}
    url = f"{API}/items/{groceries}/attachments"
    assert demo_api.post(url, content=png(), headers=headers).status_code == 201
    monkeypatch.setattr("haalendar.attachments.api.MAX_ACCOUNT_FILES_BYTES", 1)
    full = demo_api.post(url, content=png((50, 50)), headers=headers)
    assert full.status_code == 413
    assert "no room" in full.json()["detail"]


def test_the_first_reset_waits_for_the_migrations_and_the_app() -> None:
    """+++===+++ 2026-11-09 — Hasan Alizada — HAAL-154. Started with migrate, both change the same database role at once
    and one fails (seen on the CI runner): a failed migrate stops the start of the whole stand."""
    overlay = Path(__file__).resolve().parents[2] / "compose.demo.yaml"
    depends_on = yaml.safe_load(overlay.read_text())["services"]["demo"]["depends_on"]
    assert depends_on["migrate"]["condition"] == "service_completed_successfully"
    assert depends_on["app"]["condition"] == "service_healthy"
