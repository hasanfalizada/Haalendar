"""Time handling (FR-ACC-11): atoms time.local_to_utc.v1 and time.event_days.v1 against the shared vectors, the pinned
time zone database and UTC timestamps in the API regardless of the database server's time zone.

+++===+++ 2026-10-15 — Hasan Alizada — HAAL-169.
"""

from __future__ import annotations

import json
import zoneinfo
from datetime import date, time
from importlib.metadata import version
from pathlib import Path
from typing import Any

import psycopg
import pytest
from fastapi.testclient import TestClient
from sqlalchemy.engine import make_url

from haalendar.atoms.time.event_days import event_days
from haalendar.atoms.time.local_to_utc import UnknownTimeZoneError, local_to_utc
from haalendar.main import create_app

from .account_helpers import invite
from .conftest import make_settings

ATOMS = Path(__file__).resolve().parents[2] / "atoms"


def _cases(atom: str) -> list[dict[str, Any]]:
    cases: list[dict[str, Any]] = json.loads((ATOMS / atom / "vectors.json").read_text(encoding="utf-8"))[
        "cases"
    ]
    return cases


def _time(value: str | None) -> time | None:
    return time.fromisoformat(value) if value else None


@pytest.mark.parametrize("case", _cases("time.local_to_utc.v1"), ids=lambda c: c["name"])
def test_local_to_utc_vector(case: dict[str, Any]) -> None:
    given = case["input"]
    result = local_to_utc(date.fromisoformat(given["date"]), time.fromisoformat(given["time"]), given["tzid"])
    assert {
        "utc": result.utc_text(),
        "offset_minutes": result.offset_minutes,
        "resolution": result.resolution,
    } == case["output"]


@pytest.mark.parametrize("case", _cases("time.event_days.v1"), ids=lambda c: c["name"])
def test_event_days_vector(case: dict[str, Any]) -> None:
    event = case["input"]["event"]
    first, last = event_days(
        all_day=event["all_day"],
        start_date=date.fromisoformat(event["start_date"]),
        end_date=date.fromisoformat(event["end_date"]),
        start_time=_time(event["start_time"]),
        end_time=_time(event["end_time"]),
        tzid=event["tzid"],
        viewer_tzid=case["input"]["viewer_tzid"],
    )
    assert {"first_day": first.isoformat(), "last_day": last.isoformat()} == case["output"]


def test_unknown_zone_is_rejected() -> None:
    with pytest.raises(UnknownTimeZoneError):
        local_to_utc(date(2026, 1, 1), time(9, 0), "Mars/Olympus_Mons")


def test_time_zone_rules_come_only_from_the_pinned_tzdata() -> None:
    assert zoneinfo.TZPATH == ()
    assert version("tzdata") == "2026.5"
    assert "Europe/Kyiv" in zoneinfo.available_timezones()


@pytest.mark.db
def test_api_timestamps_are_utc_even_if_the_server_zone_is_not(
    clean_db: str, owner_db_url: str, mail_dir: Path
) -> None:
    owner = make_url(owner_db_url)
    dsn = owner.set(drivername="postgresql").render_as_string(hide_password=False)
    with psycopg.connect(dsn, autocommit=True) as conn:
        conn.execute(f"ALTER DATABASE \"{owner.database}\" SET timezone = 'Asia/Baku'")
    try:
        token = invite(clean_db, "zoe@example.org")
        app = create_app(make_settings(database_url=clean_db, mail_dir=str(mail_dir)))
        with TestClient(app, base_url="https://testserver", raise_server_exceptions=False) as api:
            expires = api.post("/api/v1/auth/invite-info", json={"token": token}).json()["expires_at"]
        assert expires.endswith("Z")
    finally:
        with psycopg.connect(dsn, autocommit=True) as conn:
            conn.execute(f'ALTER DATABASE "{owner.database}" RESET timezone')
