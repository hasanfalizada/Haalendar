"""Record timestamps (FR-X-02): every table with created_at / updated_at has its trigger; any UPDATE refreshes
updated_at and cannot change created_at (marker `db`).

+++===+++ 2026-10-16 — Hasan Alizada — HAAL-031.
"""

from __future__ import annotations

import uuid

import psycopg
import pytest
from sqlalchemy.engine import make_url

pytestmark = pytest.mark.db


def _dsn(url: str) -> str:
    return make_url(url).set(drivername="postgresql").render_as_string(hide_password=False)


def test_every_timestamped_table_has_its_trigger(owner_db_url: str) -> None:
    with psycopg.connect(_dsn(owner_db_url), autocommit=True) as conn:
        columns = conn.execute(
            "SELECT table_name, column_name FROM information_schema.columns WHERE table_schema = 'public' "
            "AND column_name IN ('created_at', 'updated_at')"
        ).fetchall()
        triggers = {
            (r[0], r[1])
            for r in conn.execute(
                "SELECT c.relname, t.tgname FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid "
                "WHERE NOT t.tgisinternal"
            )
        }
    assert columns
    expected = {
        (table, "haalendar_keep_created_at" if column == "created_at" else "haalendar_touch_updated_at")
        for table, column in columns
    }
    assert expected <= triggers, expected - triggers


def test_raw_update_refreshes_updated_at_and_keeps_created_at(clean_db: str, owner_db_url: str) -> None:
    owner, calendar = uuid.uuid7(), uuid.uuid7()
    with psycopg.connect(_dsn(owner_db_url), autocommit=True) as conn:
        conn.execute(
            "INSERT INTO user_account (id, email, password_hash, display_name, time_zone) "
            "VALUES (%s, 'tim@example.org', 'x', 'Tim', 'UTC')",
            (owner,),
        )
        conn.execute(
            "INSERT INTO calendar (id, owner_id, name, created_at, updated_at) "
            "VALUES (%s, %s, 'Old', now() - interval '3 days', now() - interval '3 days')",
            (calendar, owner),
        )
        # Plain SQL, no ORM: the trigger refreshes updated_at and ignores the attempt to rewrite created_at.
        conn.execute(
            "UPDATE calendar SET name = 'New', created_at = now(), updated_at = now() - interval '1 year' "
            "WHERE id = %s",
            (calendar,),
        )
        row = conn.execute(
            "SELECT created_at < now() - interval '2 days', updated_at > now() - interval '1 minute' "
            "FROM calendar WHERE id = %s",
            (calendar,),
        ).fetchone()
    assert row == (True, True)
