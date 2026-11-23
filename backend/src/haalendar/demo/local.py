"""The demo's made-up data in a local stand: `python -m haalendar.demo.local` (scripts/dev/stack-up.sh --demo).

+++===+++ 2026-11-18 21:00 +04 — Hasan Alizada — HAAL-193. A stand for a live check opens with something to look at:
the accounts and data of the public demo (dates of the current week), in a database just migrated. Mira is made the
stand's administrator, so there is no first-run setup and the administration pages can be checked too. It only adds
to a database without any account and refuses any other, so it never mixes with real data.
"""

from __future__ import annotations

import asyncio
import sys
from datetime import UTC, datetime

import psycopg

from haalendar.config import Settings, load_settings
from haalendar.db import create_engine, create_session_factory
from haalendar.demo import ALEX, MIRA, PASSWORD
from haalendar.demo.reset import _libpq, _owner
from haalendar.demo.seed import seed


class RefusedError(Exception):
    """The database already has accounts: nothing is added."""


def fill(settings: Settings, now: datetime | None = None) -> None:
    """Adds the demo's accounts and data to a migrated database without accounts; Mira becomes its administrator."""
    with psycopg.connect(_libpq(_owner(settings)), autocommit=True) as conn:
        row = conn.execute("SELECT count(*) FROM user_account").fetchone()
        if row and row[0]:
            raise RefusedError(
                f"the database already has {row[0]} accounts: the demo data goes only into an empty one"
            )

    async def run() -> None:
        engine = create_engine(settings)
        try:
            await seed(create_session_factory(engine), now or datetime.now(UTC))
        finally:
            await engine.dispose()

    asyncio.run(run())
    with psycopg.connect(_libpq(_owner(settings)), autocommit=True) as conn:
        conn.execute("UPDATE user_account SET role = 'admin' WHERE id = %s", (MIRA.id,))


def main() -> None:
    try:
        fill(load_settings())
    except RefusedError as refused:
        print(f"demo data not added: {refused}", file=sys.stderr)
        sys.exit(1)
    # The demo's password is public (its sign-in page shows it).
    print(f"demo:  {MIRA.email} (administrator) or {ALEX.email}, password {PASSWORD}")


if __name__ == "__main__":
    main()
