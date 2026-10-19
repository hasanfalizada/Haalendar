"""User settings (FR-ACC-09, FR-CAL-23/27, D-50): defaults on first use, merge patch with If-Match, validation,
owner-only access, no physical delete, part of the export.

+++===+++ 2026-10-19 — Hasan Alizada — HAAL-045.
"""

from __future__ import annotations

import psycopg
import pytest
from fastapi.testclient import TestClient
from sqlalchemy.engine import make_url

from .account_helpers import create_user, login

MERGE = "application/merge-patch+json"
DEFAULTS = {
    "week_start": 1,
    "time_format": "24h",
    "theme": "system",
    "default_color": "brown",
    "agenda_days": 30,
    "week_ab": {"enabled": False, "anchor": None, "labels": ["A", "B"]},
    "version": 1,
}


def _dsn(url: str) -> str:
    return make_url(url).set(drivername="postgresql").render_as_string(hide_password=False)


def _signed_in(api: TestClient, db_url: str, address: str = "sam@example.org") -> dict[str, str]:
    create_user(api, db_url, address)
    status, body = login(api, address)
    assert status == 200
    token = body["csrf_token"]
    assert isinstance(token, str)
    return {"X-CSRF-Token": token, "Content-Type": MERGE}


def _patch(
    api: TestClient, headers: dict[str, str], body: object, version: int = 1
) -> tuple[int, dict[str, object]]:
    response = api.patch("/api/v1/me/settings", json=body, headers={**headers, "If-Match": f'"{version}"'})
    return response.status_code, response.json()


@pytest.mark.db
def test_defaults_on_first_use(api: TestClient, clean_db: str, owner_db_url: str) -> None:
    _signed_in(api, clean_db)
    first = api.get("/api/v1/me/settings")
    assert first.status_code == 200
    assert first.json() == DEFAULTS
    assert first.headers["ETag"] == '"1"'
    assert api.get("/api/v1/me/settings").json() == DEFAULTS
    with psycopg.connect(_dsn(owner_db_url)) as conn:
        assert conn.execute("SELECT count(*) FROM user_settings").fetchone() == (1,)


@pytest.mark.db
def test_patch_with_if_match(api: TestClient, clean_db: str) -> None:
    headers = _signed_in(api, clean_db)
    body = {
        "week_start": 0,
        "time_format": "12h",
        "theme": "dark",
        "default_color": "blue",
        "agenda_days": 14,
    }

    missing = api.patch("/api/v1/me/settings", json=body, headers=headers)
    assert missing.status_code == 428
    status, stale = _patch(api, headers, body, version=5)
    assert status == 412 and stale["current"] == DEFAULTS

    status, updated = _patch(api, headers, body)
    assert status == 200
    assert updated == {**DEFAULTS, **body, "version": 2}
    assert api.get("/api/v1/me/settings").headers["ETag"] == '"2"'

    status, same = _patch(api, headers, {"theme": "dark"}, version=2)
    assert status == 200 and same["version"] == 2  # nothing changed, no new version


@pytest.mark.db
def test_week_ab(api: TestClient, clean_db: str) -> None:
    headers = _signed_in(api, clean_db)
    status, problem = _patch(api, headers, {"week_ab": {"enabled": True}})
    assert status == 422 and problem["errors"] == [
        {"pointer": "/week_ab/anchor", "detail": "Choose a date in a week that should be labelled first"}
    ]
    status, problem = _patch(api, headers, {"week_ab": {"labels": ["Odd", " odd "]}})
    assert status == 422 and problem["errors"][0]["pointer"] == "/week_ab/labels"  # type: ignore[index]
    status, problem = _patch(api, headers, {"week_ab": {"labels": ["A", "  "]}})
    assert status == 422 and problem["errors"][0]["pointer"] == "/week_ab/labels/1"  # type: ignore[index]
    status, problem = _patch(api, headers, {"week_ab": {"labels": ["A", "B" * 11]}})
    assert status == 422 and problem["errors"][0]["pointer"] == "/week_ab/labels/1"  # type: ignore[index]

    status, updated = _patch(
        api, headers, {"week_ab": {"enabled": True, "anchor": "2026-10-21", "labels": [" Odd ", "Even"]}}
    )
    assert status == 200
    assert updated["week_ab"] == {"enabled": True, "anchor": "2026-10-21", "labels": ["Odd", "Even"]}
    # Merge patch: the other Week A/B keys stay as they are.
    status, updated = _patch(api, headers, {"week_ab": {"enabled": False}}, version=2)
    assert status == 200
    assert updated["week_ab"] == {"enabled": False, "anchor": "2026-10-21", "labels": ["Odd", "Even"]}


@pytest.mark.db
@pytest.mark.parametrize(
    "body",
    [
        {"week_start": 7},
        {"time_format": "24"},
        {"theme": "sepia"},
        {"default_color": "pink"},
        {"agenda_days": 0},
        {"agenda_days": 366},
        {"week_ab": {"labels": ["A"]}},
        {"week_ab": {"anchor": "2026-02-30"}},
        {"version": 3},
    ],
)
def test_invalid_values_are_refused(api: TestClient, clean_db: str, body: dict[str, object]) -> None:
    headers = _signed_in(api, clean_db)
    status, _ = _patch(api, headers, body)
    assert status == 422


@pytest.mark.db
def test_only_the_owner_sees_and_changes_settings(api: TestClient, clean_db: str, db_url: str) -> None:
    headers = _signed_in(api, clean_db, "ada@example.org")
    assert _patch(api, headers, {"theme": "dark"})[0] == 200
    with psycopg.connect(_dsn(db_url), autocommit=True) as conn:
        ada = conn.execute("SELECT id FROM user_account WHERE email = 'ada@example.org'").fetchone()
    assert ada is not None
    api.cookies.clear()
    bob_headers = _signed_in(api, clean_db, "bob@example.org")
    assert api.get("/api/v1/me/settings").json()["theme"] == "system"  # Bob gets his own row
    assert _patch(api, bob_headers, {"theme": "light"})[0] == 200
    with psycopg.connect(_dsn(db_url), autocommit=True) as conn:
        bob = conn.execute("SELECT id FROM user_account WHERE email = 'bob@example.org'").fetchone()
        assert bob is not None
        conn.execute("SELECT set_config('app.user_id', %s, false)", (str(bob[0]),))
        assert conn.execute("SELECT theme FROM user_settings").fetchall() == [("light",)]
        changed = conn.execute("UPDATE user_settings SET theme = 'light' WHERE owner_id = %s", (ada[0],))
        assert changed.rowcount == 0
        with pytest.raises(psycopg.errors.InsufficientPrivilege):
            conn.execute("DELETE FROM user_settings")


@pytest.mark.db
def test_settings_need_a_session(api: TestClient) -> None:
    assert api.get("/api/v1/me/settings").status_code == 401
