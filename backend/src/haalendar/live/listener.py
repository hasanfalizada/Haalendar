"""LISTEN on `haalendar_sync` and hand each message to the open streams it concerns (ADR-0009, D-59).

+++===+++ 2026-10-22 — Hasan Alizada — HAAL-055.
- One dedicated connection per API process (application role, autocommit). Messages are only delivered for committed
  transactions, also those of the job worker or another API process.
- A message names a container (→ its owner and current grantees, `haalendar_sync_audience`) and/or user ids. The
  audience is looked up only while someone is connected here.
- When the connection fails it is opened again with a growing pause (1 s … 60 s); after it is back every open stream
  gets `changes` (messages sent in between were missed; the client's cursor pull catches up).
"""

from __future__ import annotations

import asyncio
import json
import uuid
from typing import Any

import psycopg
from sqlalchemy import func, select
from sqlalchemy.engine import make_url
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from haalendar.config import Settings
from haalendar.live.hub import Hub
from haalendar.live.sql import CHANNEL
from haalendar.logging import get_logger

log = get_logger(__name__)

MAX_PAUSE_SECONDS = 60.0


def _conninfo(settings: Settings) -> str:
    url = make_url(settings.database_url.get_secret_value()).set(drivername="postgresql")
    return url.render_as_string(hide_password=False)


def _users(raw: Any) -> set[uuid.UUID]:
    found: set[uuid.UUID] = set()
    for value in raw if isinstance(raw, list) else []:
        try:
            found.add(uuid.UUID(str(value)))
        except ValueError:
            continue
    return found


async def deliver(hub: Hub, session_factory: async_sessionmaker[AsyncSession], payload: str) -> int:
    """One message → the streams it concerns; returns how many streams were told."""
    if hub.count == 0:
        return 0
    try:
        message = json.loads(payload)
    except ValueError:
        log.warning("live_message_unreadable")
        return 0
    if not isinstance(message, dict):
        return 0
    users = _users(message.get("u"))
    kind, container = message.get("c"), message.get("i")
    if isinstance(kind, str) and isinstance(container, str):
        async with session_factory() as db:
            rows = await db.execute(select(func.haalendar_sync_audience(kind, uuid.UUID(container))))
            users.update(row[0] for row in rows)
    event = "notification" if message.get("e") == "notification" else "changes"
    return hub.publish(users & hub.users(), event)


async def listen(hub: Hub, session_factory: async_sessionmaker[AsyncSession], settings: Settings) -> None:
    """Runs for the app's lifetime (cancelled on shutdown)."""
    pause = 1.0
    first = True
    while True:
        try:
            async with await psycopg.AsyncConnection.connect(_conninfo(settings), autocommit=True) as conn:
                await conn.execute(f"LISTEN {CHANNEL}")
                log.info("live_listening", reconnected=not first)
                if not first:
                    hub.publish_all("changes")
                first, pause = False, 1.0
                async for notice in conn.notifies():
                    try:
                        await deliver(hub, session_factory, notice.payload)
                    except (SQLAlchemyError, ValueError) as error:  # one bad message never stops the listener
                        log.warning("live_delivery_failed", error=type(error).__name__)
        except asyncio.CancelledError:
            raise
        except (psycopg.Error, OSError) as error:
            log.warning("live_listener_failed", error=type(error).__name__, retry_seconds=pause)
            await asyncio.sleep(pause)
            pause = min(pause * 2, MAX_PAUSE_SECONDS)
