"""Live updates (FR-OFF-03, ADR-0009, D-59): the hub (limits, bursts, only the users concerned), the database
trigger (a message only on commit, whom it names), the audience (owner and current grantees), delivery, and the
`/stream` endpoint on a real server (first `changes`, a change made through another app instance arrives, a share
brings `notification`, 401, 429, a revoked session ends the stream). Marker `db` for the database parts.

+++===+++ 2026-10-22 — Hasan Alizada — HAAL-055.
"""

from __future__ import annotations

import asyncio
import http.client
import json
import socket
import threading
import time
import uuid
from collections.abc import Iterator
from pathlib import Path

import psycopg
import pytest
import uvicorn
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy.ext.asyncio import create_async_engine

from haalendar.db import create_session_factory
from haalendar.deps import SESSION_COOKIE
from haalendar.errors import ProblemError
from haalendar.live import api as live_api
from haalendar.live.hub import Hub
from haalendar.live.listener import deliver
from haalendar.live.sql import CHANNEL
from haalendar.main import create_app

from .conftest import make_settings
from .test_isolation import _dsn, as_user
from .test_sharing import People

# --- hub (no database) ---------------------------------------------------------------------------------------------


def test_hub_limits_bursts_and_only_the_users_concerned() -> None:
    async def scenario() -> None:
        hub = Hub(per_user=2, total=3)
        ada, bob = uuid.uuid7(), uuid.uuid7()
        first, second = hub.open(ada), hub.open(ada)
        with pytest.raises(ProblemError) as too_many:
            hub.open(ada)
        assert too_many.value.status == 429
        bobs = hub.open(bob)
        with pytest.raises(ProblemError):
            hub.open(uuid.uuid7())  # the process limit
        assert hub.count == 3

        for _ in range(5):
            hub.publish([ada], "changes")
        hub.publish([ada], "notification")
        assert await first.next_events(1) == ["changes", "notification"]  # a burst is one event each
        assert await second.next_events(1) == ["changes", "notification"]
        assert await bobs.next_events(0.05) == []  # not concerned
        assert hub.publish([uuid.uuid7()], "changes") == 0

        hub.close(first)
        hub.close(second)
        assert hub.users() == frozenset({bob}) and hub.publish_all("changes") == 1

    asyncio.run(scenario())


# --- database ------------------------------------------------------------------------------------------------------


@pytest.fixture
def people(api: TestClient, clean_db: str) -> People:
    return People(api, clean_db)


def _messages(listener: psycopg.Connection, wait: float) -> list[dict[str, object]]:
    found = [json.loads(n.payload) for n in listener.notifies(timeout=wait, stop_after=None)]
    return [m for m in found if isinstance(m, dict)]


@pytest.mark.db
def test_trigger_names_whom_to_tell_and_only_after_commit(people: People, clean_db: str) -> None:
    ada, bob = people.ids["ada"], people.ids["bob"]
    with psycopg.connect(_dsn(clean_db), autocommit=True) as listener:
        listener.execute(f"LISTEN {CHANNEL}")
        with psycopg.connect(_dsn(clean_db)) as writer:
            writer.execute("SELECT set_config('app.user_id', %s, false)", (ada,))
            writer.execute(
                "UPDATE calendar SET name = 'Home', version = version + 1 WHERE id = %s", (people.calendar,)
            )
            writer.execute(
                "UPDATE calendar SET color = 'red', version = version + 1 WHERE id = %s", (people.calendar,)
            )
            assert _messages(listener, 0.3) == []  # nothing before the commit
            writer.commit()
        assert _messages(listener, 1) == [
            {"c": "calendar", "i": people.calendar}
        ]  # identical messages merged

        assert people.share(people.as_("ada"), "bob@example.org").status_code == 201
        received = _messages(listener, 1)
        share = next(m for m in received if "u" in m and m.get("c") == "calendar")
        users = share["u"]
        assert isinstance(users, list) and set(users) == {bob, ada}
        assert {"e": "notification", "u": [bob]} in received  # the share notification (HAAL-048)


@pytest.mark.db
def test_audience_is_owner_and_current_grantees(people: People, clean_db: str) -> None:
    ada = people.as_("ada")
    people.share(ada, "bob@example.org")
    share_id = people.share(ada, "cid@example.org").json()["id"]

    def audience() -> set[str]:
        with psycopg.connect(_dsn(clean_db), autocommit=True) as conn:
            rows = conn.execute(
                "SELECT haalendar_sync_audience('calendar', %s)", (people.calendar,)
            ).fetchall()
        return {str(row[0]) for row in rows}

    assert audience() == {people.ids["ada"], people.ids["bob"], people.ids["cid"]}
    assert people.api.delete(f"/api/v1/shares/{share_id}", headers=ada).status_code == 204
    assert audience() == {people.ids["ada"], people.ids["bob"]}


@pytest.mark.db
def test_delivery_reaches_only_connected_users_concerned(people: People, clean_db: str) -> None:
    people.share(people.as_("ada"), "bob@example.org")

    async def scenario() -> None:
        engine = create_async_engine(clean_db)
        hub, factory = Hub(), create_session_factory(engine)
        bob, cid = hub.open(uuid.UUID(people.ids["bob"])), hub.open(uuid.UUID(people.ids["cid"]))
        container = json.dumps({"c": "calendar", "i": people.calendar})
        assert (
            await deliver(hub, factory, container) == 1
        )  # bob (grantee); cid has no access; ada not connected
        assert await bob.next_events(1) == ["changes"] and await cid.next_events(0.05) == []
        assert await deliver(hub, factory, json.dumps({"e": "notification", "u": [people.ids["cid"]]})) == 1
        assert await cid.next_events(1) == ["notification"]
        assert await deliver(hub, factory, "not json") == 0
        await engine.dispose()

    asyncio.run(scenario())


# --- the endpoint on a real server ---------------------------------------------------------------------------------


def _free_port() -> int:
    with socket.socket() as probe:
        probe.bind(("127.0.0.1", 0))
        port: int = probe.getsockname()[1]
        return port


@pytest.fixture
def live_app(clean_db: str, mail_dir: Path, monkeypatch: pytest.MonkeyPatch) -> Iterator[tuple[FastAPI, int]]:
    """A second app instance (as another API process) served by uvicorn: TestClient cannot read an endless stream."""
    monkeypatch.setattr(live_api, "PING_SECONDS", 1.5)
    app = create_app(make_settings(database_url=clean_db, mail_dir=str(mail_dir)))
    port = _free_port()
    server = uvicorn.Server(uvicorn.Config(app, host="127.0.0.1", port=port, log_config=None, lifespan="on"))
    thread = threading.Thread(target=server.run, daemon=True)
    thread.start()
    deadline = time.monotonic() + 15
    while not server.started and time.monotonic() < deadline:
        time.sleep(0.05)
    assert server.started
    yield app, port
    server.should_exit = True
    thread.join(10)


class Events:
    """Reads one SSE stream line by line."""

    def __init__(self, port: int, cookie: str | None) -> None:
        self.conn = http.client.HTTPConnection("127.0.0.1", port, timeout=10)
        headers = {
            "Accept": "text/event-stream",
            **({"Cookie": f"{SESSION_COOKIE}={cookie}"} if cookie else {}),
        }
        self.conn.request("GET", "/api/v1/stream", headers=headers)
        self.response = self.conn.getresponse()

    def next(self) -> str | None:
        """The next event name (pings included); None when the stream ended."""
        event = None
        while True:
            line = self.response.readline()
            if not line:
                return None
            text = line.decode().rstrip("\r\n")
            if text.startswith("event:"):
                event = text.split(":", 1)[1].strip()
            elif text == "" and event:
                return event

    def until(self, wanted: str, limit: int = 10) -> bool:
        for _ in range(limit):
            event = self.next()
            if event == wanted:
                return True
            if event is None:
                return False
        return False

    def close(self) -> None:
        self.conn.close()


def _cookie(api: TestClient) -> str:
    value = api.cookies.get(SESSION_COOKIE)
    assert value
    return value


@pytest.mark.db
def test_stream_end_to_end(people: People, live_app: tuple[FastAPI, int]) -> None:
    app, port = live_app
    refused = Events(port, None)
    assert refused.response.status == 401
    refused.close()

    ada = people.as_("ada")
    ada_cookie = _cookie(people.api)
    stream = Events(port, ada_cookie)
    assert stream.response.status == 200
    assert stream.response.getheader("Content-Type", "").startswith("text/event-stream")
    assert stream.response.getheader("X-Accel-Buffering") == "no"
    assert stream.next() == "changes"  # catch up first
    assert app.state.live_hub.count == 1

    # A change made through the other app instance (TestClient) arrives here.
    mutation = {
        "mutation_id": str(uuid.uuid7()),
        "entity_type": "calendar",
        "entity_id": people.calendar,
        "op": "update",
        "base": {"name": "Family"},
        "data": {"name": "Home"},
    }
    assert (
        people.api.post("/api/v1/sync/push", json={"mutations": [mutation]}, headers=ada).status_code == 200
    )
    started = time.monotonic()
    assert stream.until("changes")
    assert time.monotonic() - started < 2

    # Bob: a new share brings the notification and the changes.
    app.state.live_hub.per_user = 1
    people.share(ada, "bob@example.org")
    people.as_("bob")
    bob_cookie = _cookie(people.api)
    bob = Events(port, bob_cookie)
    assert bob.next() == "changes"
    second = Events(port, bob_cookie)
    assert second.response.status == 429  # one stream per user in this test
    second.close()
    people.share(people.as_("ada"), "cid@example.org")  # concerns bob as a grantee of the same calendar
    assert bob.until("changes")

    # The session is revoked (sign-out or "sign out other devices"): the stream ends at the next check.
    with as_user(people.db_url, uuid.UUID(people.ids["bob"])) as conn:
        conn.execute("UPDATE session SET revoked_at = now() WHERE user_id = %s", (people.ids["bob"],))
    assert bob.until("never", limit=5) is False
    bob.close()
    stream.close()
