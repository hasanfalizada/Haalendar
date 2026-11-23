"""The due date of a note (FR-TODO-01, FR-TODO-06, D-121): a date with an optional time, as a card's — written through
sync on create and update, a time only with a date, a date cleared takes the time along, merged field by field, written
by an edit share as well; the migration keeps a value of the former `due_at` in the owner's zone. Marker `db`.

+++===+++ 2026-11-23 17:40 +04 — Hasan Alizada — HAAL-104.
"""

from __future__ import annotations

import os
import secrets
import uuid
from collections.abc import Iterator

import psycopg
import pytest
from alembic import command
from alembic.config import Config
from fastapi.testclient import TestClient
from sqlalchemy.engine import make_url

from haalendar.config import load_settings
from haalendar.db import ALEMBIC_INI
from haalendar.dbroles import bootstrap

from .conftest import TEST_DB_ENV, _libpq_url
from .test_note_sharing import _shared_note
from .test_notes import _create, _row
from .test_reminders import _as
from .test_sharing import People
from .test_sync import _m, _push


@pytest.fixture
def people(api: TestClient, clean_db: str) -> People:
    return People(api, clean_db)


@pytest.mark.db
def test_a_due_date_with_or_without_a_time(people: People) -> None:
    ada = people.as_("ada")
    note, created = _create(people, ada, due_date="2026-12-01", due_time="09:30:00")
    assert created["status"] == "applied", created
    row = _row(people, note)
    assert (row["due_date"], row["due_time"]) == ("2026-12-01", "09:30")
    assert "due_at" not in row

    # Field by field: the time alone, then the date cleared takes the time along.
    later = _m("item", note, "update", base={"due_time": "09:30"}, data={"due_time": "18:00"})
    assert _push(people.api, ada, later)[0]["status"] == "applied"
    assert _row(people, note)["due_time"] == "18:00"
    cleared = _m("item", note, "update", base={"due_date": "2026-12-01"}, data={"due_date": None})
    assert _push(people.api, ada, cleared)[0]["status"] == "applied"
    assert _as(people, "ada", "SELECT due_date, due_time FROM note WHERE id = %s", note) == [(None, None)]

    # A date alone is the whole day; a stale base conflicts and keeps the server's value.
    whole_day = _m("item", note, "update", base={"due_date": None}, data={"due_date": "2026-12-24"})
    assert _push(people.api, ada, whole_day)[0]["status"] == "applied"
    stale = _m("item", note, "update", base={"due_date": "2026-12-01"}, data={"due_date": "2027-01-01"})
    [result] = _push(people.api, ada, stale)
    assert result["status"] == "conflict" and result["fields"] == ["due_date"]
    assert (result["current"]["due_date"], result["current"]["due_time"]) == ("2026-12-24", None)

    # A note without a due date has none.
    plain, _ = _create(people, ada)
    assert (_row(people, plain)["due_date"], _row(people, plain)["due_time"]) == (None, None)


@pytest.mark.db
def test_rules_of_a_due_date(people: People) -> None:
    ada = people.as_("ada")
    for data, field in (
        ({"due_time": "09:00"}, "due_time"),
        ({"due_date": "01.12.2026"}, "due_date"),
        ({"due_date": "2026-12-01", "due_time": "9 am"}, "due_time"),
    ):
        _, result = _create(people, ada, **data)
        assert result["status"] == "rejected", (data, result)
        assert result["problem"]["errors"][0]["pointer"] == f"/{field}"
    note, _ = _create(people, ada)
    no_date = _m("item", note, "update", base={"due_time": None}, data={"due_time": "10:00"})
    assert _push(people.api, ada, no_date)[0]["status"] == "rejected"
    # An event has no due date.
    event = {
        "kind": "event",
        "container_kind": "calendar",
        "container_id": people.calendar,
        "title": "Dentist",
        "start_date": "2026-11-12",
        "due_date": "2026-11-12",
    }
    assert (
        _push(people.api, ada, _m("item", str(uuid.uuid7()), "create", data=event))[0]["status"] == "rejected"
    )


@pytest.mark.db
def test_an_edit_share_sets_the_due_date_a_view_share_does_not(people: People) -> None:
    note, _ = _shared_note(people, "edit")
    bob = people.as_("bob")
    due = _m(
        "item",
        note,
        "update",
        base={"due_date": None, "due_time": None},
        data={"due_date": "2026-12-05", "due_time": "08:15"},
    )
    assert _push(people.api, bob, due)[0]["status"] == "applied"
    assert _as(
        people, "ada", "SELECT due_date::text, to_char(due_time, 'HH24:MI') FROM note WHERE id = %s", note
    ) == [("2026-12-05", "08:15")]
    viewed, _ = _shared_note(people, "view")
    bob = people.as_("bob")
    refused = _m("item", viewed, "update", base={"due_date": None}, data={"due_date": "2026-12-05"})
    assert _push(people.api, bob, refused)[0]["status"] == "rejected"


@pytest.fixture
def at_0034() -> Iterator[tuple[str, Config]]:
    """A database of its own migrated to 0034 (owner URL) and the Alembic config to go on with."""
    server_url = os.environ.get(TEST_DB_ENV)
    if not server_url:
        pytest.skip(f"{TEST_DB_ENV} is not set; database tests skipped")
    suffix = uuid.uuid4().hex[:12]
    name, role = f"haalendar_m35_{suffix}", f"haalendar_m35_{suffix}"
    admin_dsn = _libpq_url(server_url, "postgres")
    with psycopg.connect(admin_dsn, autocommit=True) as conn:
        conn.execute(f'CREATE DATABASE "{name}"')
    owner_url = make_url(server_url).set(database=name)
    environment = {
        "HAALENDAR_MIGRATION_DATABASE_URL": owner_url.render_as_string(hide_password=False),
        "HAALENDAR_DATABASE_URL": owner_url.set(
            username=role, password=secrets.token_urlsafe(18)
        ).render_as_string(hide_password=False),
    }
    previous = {key: os.environ.get(key) for key in environment}
    os.environ.update(environment)
    try:
        bootstrap(load_settings({**environment, "HAALENDAR_ENV": "test"}))
        config = Config(str(ALEMBIC_INI))
        command.upgrade(config, "0034")
        yield _libpq_url(environment["HAALENDAR_MIGRATION_DATABASE_URL"], name), config
    finally:
        for key, value in previous.items():
            if value is None:
                os.environ.pop(key, None)
            else:
                os.environ[key] = value
        with psycopg.connect(admin_dsn, autocommit=True) as conn:
            conn.execute(f'DROP DATABASE IF EXISTS "{name}" WITH (FORCE)')
            conn.execute(f'DROP ROLE IF EXISTS "{role}"')


@pytest.mark.db
def test_the_migration_keeps_a_former_due_at_in_the_owners_zone(at_0034: tuple[str, Config]) -> None:
    dsn, config = at_0034
    user, with_due, without = uuid.uuid7(), uuid.uuid7(), uuid.uuid7()
    with psycopg.connect(dsn, autocommit=True) as conn:
        conn.execute(
            "INSERT INTO user_account (id, email, password_hash, display_name, time_zone) "
            "VALUES (%s, 'ada@example.org', 'x', 'Ada', 'Asia/Baku')",
            (user,),
        )
        for note, due_at in ((with_due, "2026-12-01T20:30:00Z"), (without, None)):
            conn.execute(
                "INSERT INTO item (id, kind, owner_id, container_kind, container_id) VALUES (%s, 'note', %s, 'note', %s)",
                (note, user, note),
            )
            conn.execute(
                "INSERT INTO note (id, container_kind, container_id, position, due_at) VALUES (%s, 'note', %s, 'U', %s)",
                (note, note, due_at),
            )
    command.upgrade(config, "0035")
    with psycopg.connect(dsn, autocommit=True) as conn:
        rows: dict[uuid.UUID, tuple[str | None, str | None]] = {
            row[0]: (row[1], row[2])
            for row in conn.execute(
                "SELECT id, due_date::text, to_char(due_time, 'HH24:MI') FROM note"
            ).fetchall()
        }
        columns = {
            name
            for (name,) in conn.execute(
                "SELECT column_name FROM information_schema.columns WHERE table_name = 'note'"
            ).fetchall()
        }
    # 20:30 UTC is 00:30 the next day in Baku (UTC+4).
    assert rows[with_due] == ("2026-12-02", "00:30")
    assert rows[without] == (None, None)
    assert "due_at" not in columns and {"due_date", "due_time"} <= columns
