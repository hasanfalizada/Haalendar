"""Helpers shared by the account tests (registration, login, password reset).

+++===+++ 2026-10-15 — Hasan Alizada — HAAL-161. Extracted from test_accounts.py so that every account test module
uses the same flows and assertions.
"""

from __future__ import annotations

import asyncio
import email
import re
from email.message import Message
from pathlib import Path

import psycopg
from fastapi.testclient import TestClient
from sqlalchemy.engine import make_url
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from haalendar.accounts import service

PASSWORD = "quiet-mountain-river-42"
TZ = "Europe/Berlin"


def sql(db_url: str, statement: str, *params: object) -> list[tuple[object, ...]]:
    url = make_url(db_url).set(drivername="postgresql").render_as_string(hide_password=False)
    with psycopg.connect(url, autocommit=True) as conn:
        cursor = conn.execute(statement, params or None)
        return cursor.fetchall() if cursor.description else []


def sql_maintenance(owner_db_url: str, statement: str, *params: object) -> None:
    """Change data the application may not change (e.g. move created_at back to simulate elapsed time).

    +++===+++ 2026-10-16 — Hasan Alizada — HAAL-031. Uses the documented maintenance path: owner connection with
    session_replication_role = replica, which skips the record-time and no-delete triggers.
    """
    url = make_url(owner_db_url).set(drivername="postgresql").render_as_string(hide_password=False)
    with psycopg.connect(url, autocommit=True) as conn:
        conn.execute("SET session_replication_role = replica")
        conn.execute(statement, params or None)


def invite(db_url: str, address: str, role: str = "user") -> str:
    async def run() -> str:
        engine = create_async_engine(db_url)
        try:
            async with async_sessionmaker(engine)() as db:
                token = await service.create_invite(db, address, role)
                await db.commit()
                return token
        finally:
            await engine.dispose()

    return asyncio.run(run())


def register(api: TestClient, address: str, invite_token: str | None = None, **extra: object) -> int:
    body: dict[str, object] = {
        "email": address,
        "password": PASSWORD,
        "display_name": "Test User",
        "time_zone": TZ,
    }
    if invite_token:
        body["invite_token"] = invite_token
    body.update(extra)
    return api.post("/api/v1/auth/register", json=body).status_code


def login(api: TestClient, address: str, password: str = PASSWORD) -> tuple[int, dict[str, object]]:
    response = api.post("/api/v1/auth/login", json={"email": address, "password": password})
    return response.status_code, response.json() if response.content else {}


def create_user(api: TestClient, db_url: str, address: str, role: str = "user") -> None:
    assert register(api, address, invite(db_url, address, role)) == 202


def mails(mail_dir: Path) -> list[Message]:
    return [email.message_from_bytes(p.read_bytes()) for p in sorted(mail_dir.glob("*.eml"))]


def link_token(message: Message) -> str:
    body = message.get_payload(decode=True)
    assert isinstance(body, bytes)
    found = re.search(r"token=([A-Za-z0-9_\-]+)", body.decode())
    assert found, body
    return found.group(1)
