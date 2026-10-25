"""Single occurrences of a series through sync (FR-CAL-11..14, D-67): exclude a date (once, only a real occurrence,
only of a series), replace it by a one-off event, include it again (the exception is kept, marked deleted), rights,
the pulled `exceptions`, moving a series takes its exceptions along, and the derived effective start. Marker `db`
except the pure effective-start cases.

+++===+++ 2026-10-23 — Hasan Alizada — HAAL-067.
"""

from __future__ import annotations

import uuid
from datetime import date
from typing import Any

import psycopg
import pytest
from fastapi.testclient import TestClient

from haalendar.planning.occurrences import effective_start

from .test_isolation import _dsn
from .test_sharing import People
from .test_sync import _m, _pull, _push


@pytest.fixture
def people(api: TestClient, clean_db: str) -> People:
    return People(api, clean_db)


def _event(people: People, headers: dict[str, str], **data: Any) -> str:
    event_id = str(uuid.uuid7())
    body = {
        "kind": "event",
        "container_kind": "calendar",
        "container_id": people.calendar,
        "title": "Standup",
    }
    result = _push(people.api, headers, _m("item", event_id, "create", data={**body, **data}))[0]
    assert result["status"] == "applied", result
    return event_id


def _occurrence(
    people: People, headers: dict[str, str], op: str, event_id: str, day: str, **extra: Any
) -> Any:
    return _push(people.api, headers, _m("item", event_id, op, data={"occurrence_date": day, **extra}))[0]


def _pulled(people: People, event_id: str) -> dict[str, Any]:
    found = [c["data"] for c in _pull(people.api)["changes"] if c["entity_id"] == event_id]
    assert found
    data: dict[str, Any] = found[0]
    return data


def _exceptions(people: People, event_id: str) -> list[tuple[str, str, bool, str | None]]:
    with psycopg.connect(_dsn(people.db_url), autocommit=True) as conn:
        conn.execute("SELECT set_config('app.user_id', %s, false)", (people.ids["ada"],))
        rows = conn.execute(
            "SELECT occurrence_date::text, kind, deleted_at IS NOT NULL, container_id::text "
            "FROM recurrence_exception WHERE event_id = %s ORDER BY occurrence_date, created_at",
            (event_id,),
        ).fetchall()
    return [tuple(r) for r in rows]


SERIES = {"start_date": "2026-11-02", "rrule": "FREQ=DAILY"}


@pytest.mark.db
def test_exclude_once_pull_lists_it_include_brings_it_back(people: People) -> None:
    ada = people.as_("ada")
    series = _event(people, ada, **SERIES)
    first = _occurrence(people, ada, "exclude", series, "2026-11-04")
    assert first["status"] == "applied" and first["version"] == 2
    again = _occurrence(people, ada, "exclude", series, "2026-11-04")
    assert again["status"] == "applied" and again["version"] == 2  # nothing new
    assert _pulled(people, series)["exceptions"] == ["2026-11-04"]

    back = _occurrence(people, ada, "include", series, "2026-11-04")
    assert back["status"] == "applied" and back["version"] == 3
    assert _pulled(people, series)["exceptions"] == []
    assert _exceptions(people, series) == [("2026-11-04", "cancelled", True, people.calendar)]  # kept, marked
    assert _occurrence(people, ada, "include", series, "2026-11-04")["version"] == 3

    _occurrence(people, ada, "exclude", series, "2026-11-04")  # a new exception after the old one
    assert [e[2] for e in _exceptions(people, series)] == [True, False]


@pytest.mark.db
def test_only_occurrences_of_a_series(people: People) -> None:
    ada = people.as_("ada")
    weekly = _event(people, ada, start_date="2026-11-02", rrule="FREQ=WEEKLY")
    one_off = _event(people, ada, start_date="2026-11-02")
    for event_id, day in ((weekly, "2026-11-03"), (weekly, "2026-10-26"), (one_off, "2026-11-02")):
        result = _occurrence(people, ada, "exclude", event_id, day)
        assert result["status"] == "rejected" and result["problem"]["status"] == 422, result
    bad = _push(people.api, ada, _m("item", weekly, "exclude", data={"occurrence_date": "soon"}))[0]
    assert bad["status"] == "rejected" and bad["problem"]["status"] == 422
    assert _occurrence(people, ada, "exclude", weekly, "2026-11-09")["status"] == "applied"


@pytest.mark.db
def test_replaced_by_a_one_off_event(people: People) -> None:
    ada = people.as_("ada")
    series = _event(people, ada, **SERIES)
    clone = _event(people, ada, start_date="2026-11-05", title="Standup (moved room)")
    other_series = _event(people, ada, **SERIES)
    refused = _occurrence(people, ada, "exclude", series, "2026-11-05", override_event_id=other_series)
    assert refused["status"] == "rejected" and refused["problem"]["status"] == 422
    applied = _occurrence(people, ada, "exclude", series, "2026-11-05", override_event_id=clone)
    assert applied["status"] == "applied"
    assert _exceptions(people, series) == [("2026-11-05", "overridden", False, people.calendar)]


@pytest.mark.db
def test_rights_and_deleted_series(people: People) -> None:
    ada = people.as_("ada")
    assert people.share(ada, "bob@example.org", "view").status_code == 201
    assert people.share(ada, "cid@example.org", "edit").status_code == 201
    series = _event(people, ada, **SERIES)

    bob = people.as_("bob")
    assert _occurrence(people, bob, "exclude", series, "2026-11-03")["problem"]["status"] == 403
    cid = people.as_("cid")
    assert _occurrence(people, cid, "exclude", series, "2026-11-03")["status"] == "applied"

    ada = people.as_("ada")
    _push(people.api, ada, _m("item", series, "delete"))
    gone = _occurrence(people, ada, "exclude", series, "2026-11-06")
    assert gone["status"] == "rejected" and gone["problem"]["status"] == 409


@pytest.mark.db
def test_moving_a_series_moves_its_exceptions(people: People) -> None:
    ada = people.as_("ada")
    series = _event(people, ada, **SERIES)
    _occurrence(people, ada, "exclude", series, "2026-11-03")
    target = str(uuid.uuid7())
    _push(people.api, ada, _m("calendar", target, "create", data={"name": "Work"}))
    moved = _push(
        people.api,
        ada,
        _m(
            "item",
            series,
            "move",
            base={"container_kind": "calendar", "container_id": people.calendar},
            data={"container_kind": "calendar", "container_id": target},
        ),
    )[0]
    assert moved["status"] == "applied", moved
    assert _exceptions(people, series) == [("2026-11-03", "cancelled", False, target)]


def test_effective_start() -> None:
    start = date(2026, 11, 2)
    assert effective_start(start, "FREQ=DAILY", set()) == start
    assert effective_start(start, None, {start}) == start
    assert effective_start(start, "FREQ=DAILY", {start, date(2026, 11, 3)}) == date(2026, 11, 4)
    assert effective_start(start, "FREQ=DAILY", {date(2026, 11, 3)}) == start  # only leading dates move it
    assert effective_start(date(2026, 1, 31), "FREQ=MONTHLY", {date(2026, 1, 31)}) == date(2026, 3, 31)
    assert effective_start(date(2028, 2, 29), "FREQ=YEARLY", {date(2028, 2, 29)}) == date(2032, 2, 29)
