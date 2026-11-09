"""The made-up data of the demo: dates follow the current week, so the stand always looks in use.

+++===+++ 2026-11-09 — Hasan Alizada — HAAL-154. Written the way the app writes, through the sync push and the sharing
service, as the application role with each account's row-level security context: if the seed passes, the data is what
a user could have entered. Mira shares a calendar and a board with Alex, so two windows show working together.
"""

from __future__ import annotations

import uuid
from collections.abc import Callable
from datetime import date, datetime, timedelta
from typing import Any
from zoneinfo import ZoneInfo

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from haalendar.accounts import crypto
from haalendar.accounts.models import UserAccount
from haalendar.demo import ACCOUNTS, ALEX, MIRA, PASSWORD, Account
from haalendar.deps import USER_ID_SETTING
from haalendar.planning.service import create_default_calendar
from haalendar.sharing.service import create_share
from haalendar.sync.push import push
from haalendar.sync.schemas import MutationIn

ZONE = "Europe/Berlin"


class _Batch:
    """Creates in one sync push, in the order they are added; positions grow with the calls."""

    def __init__(self) -> None:
        self.mutations: list[MutationIn] = []
        self._position = 0

    def position(self) -> str:
        self._position += 1
        return f"a{self._position:03d}"

    def add(self, entity_type: str, data: dict[str, Any]) -> uuid.UUID:
        entity_id = uuid.uuid7()
        self.mutations.append(
            MutationIn.model_validate(
                {
                    "mutation_id": uuid.uuid7(),
                    "entity_type": entity_type,
                    "entity_id": entity_id,
                    "op": "create",
                    "data": data,
                }
            )
        )
        return entity_id

    def note(self, title: str, color: str, body: str, **more: Any) -> uuid.UUID:
        return self.add(
            "item",
            {
                "kind": "note",
                "container_kind": "note",
                "title": title,
                "color": color,
                "body": body,
                "position": self.position(),
                **more,
            },
        )


def _monday(today: date) -> date:
    return today - timedelta(days=today.weekday())


def _events(batch: _Batch, calendar: uuid.UUID, monday: date) -> Callable[..., uuid.UUID]:
    def timed(title: str, day: int, start: str, end: str, color: str, **more: Any) -> uuid.UUID:
        when = (monday + timedelta(days=day)).isoformat()
        return batch.add(
            "item",
            {
                "kind": "event",
                "container_kind": "calendar",
                "container_id": str(calendar),
                "tzid": ZONE,
                "title": title,
                "color": color,
                "all_day": False,
                "start_date": when,
                "start_time": start,
                "end_date": when,
                "end_time": end,
                **more,
            },
        )

    return timed


def _mira_data(batch: _Batch, own: uuid.UUID, team: uuid.UUID, monday: date) -> uuid.UUID:
    timed = _events(batch, own, monday)
    timed("Lunch with Sam", 1, "12:30", "13:30", "green")
    timed("Dentist", 2, "16:00", "17:00", "red")
    timed("Yoga", 1, "18:00", "19:00", "green", rrule="FREQ=WEEKLY;BYDAY=TU,FR")
    shared = _events(batch, team, monday)
    shared("Team stand-up", 0, "09:00", "09:30", "blue", rrule="FREQ=WEEKLY;BYDAY=MO,WE,FR")
    shared("Design review", 0, "11:00", "12:30", "purple")
    shared("Sprint planning", 1, "14:00", "16:00", "orange", priority="high")
    shared("Customer call", 3, "10:00", "11:00", "blue")
    shared("Write release notes", 3, "13:00", "15:00", "brown")
    offsite = (monday + timedelta(days=3)).isoformat()
    batch.add(
        "item",
        {
            "kind": "event",
            "container_kind": "calendar",
            "container_id": str(team),
            "tzid": ZONE,
            "title": "Team offsite",
            "color": "yellow",
            "all_day": True,
            "start_date": offsite,
            "end_date": (monday + timedelta(days=4)).isoformat(),
        },
    )

    batch.note("Book list", "purple", "**Next up:** *The Dispossessed*\n\nThen something short.")
    batch.note("Trip to Lisbon", "blue", "Flights booked. Still to do:\n\n1. Hotel\n2. Tram tickets")
    batch.note("Gift ideas", "orange", "A good pair of hiking socks, a plant, a board game.")
    batch.note("Meeting notes", "brown", "Move the release to the second week.\n\n> Keep the scope small.")
    groceries = batch.note("Groceries", "green", "", pinned=True, is_checklist=True)
    for text, checked in (
        ("Oat milk", True),
        ("Coffee beans", True),
        ("Lemons", False),
        ("Olive oil", False),
    ):
        batch.add(
            "checklist_item",
            {"item_id": str(groceries), "text": text, "checked": checked, "position": batch.position()},
        )

    board = batch.add("board", {"name": "Website launch", "position": batch.position()})

    def column(name: str, wip_limit: int | None = None) -> str:
        return str(
            batch.add(
                "board_column",
                {"board_id": str(board), "name": name, "wip_limit": wip_limit, "position": batch.position()},
            )
        )

    def label(name: str, color: str) -> str:
        return str(batch.add("label", {"board_id": str(board), "name": name, "color": color}))

    def card(column_id: str, title: str, priority: str, due: int | None, label_id: str | None = None) -> None:
        extra = {} if due is None else {"due_date": (monday + timedelta(days=due)).isoformat()}
        item = batch.add(
            "item",
            {
                "kind": "card",
                "container_kind": "board",
                "container_id": str(board),
                "column_id": column_id,
                "title": title,
                "priority": priority,
                "position": batch.position(),
                **extra,
            },
        )
        if label_id:
            batch.add("item_label", {"item_id": str(item), "label_id": label_id})

    todo, doing, done = column("To do"), column("In progress", 3), column("Done")
    design, content = label("Design", "purple"), label("Content", "blue")
    card(todo, "Write the landing page copy", "high", 3, content)
    card(todo, "Collect customer quotes", "medium", None, content)
    card(todo, "Choose the pricing table layout", "low", 6, design)
    card(doing, "Design the hero section", "high", 1, design)
    card(doing, "Set up analytics", "medium", 2)
    card(done, "Register the domain", "medium", None)
    card(done, "Pick the brand colours", "low", None, design)
    return board


def _alex_data(batch: _Batch, own: uuid.UUID, monday: date) -> None:
    timed = _events(batch, own, monday)
    timed("Gym", 0, "07:30", "08:30", "green", rrule="FREQ=WEEKLY;BYDAY=MO,TH")
    timed("Call with the bank", 2, "11:00", "11:30", "red")
    batch.note("Packing list", "blue", "Passport, charger, rain jacket.")


async def _as_user(db: AsyncSession, account: Account) -> None:
    await db.execute(select(func.set_config(USER_ID_SETTING, str(account.id), True)))


async def _push(db: AsyncSession, account: Account, batch: _Batch) -> None:
    refused = [r for r in await push(db, account.id, batch.mutations) if r["status"] != "applied"]
    if refused:
        raise RuntimeError(f"demo seed refused: {refused[:3]}")


async def seed(factory: async_sessionmaker[AsyncSession], now: datetime) -> None:
    """Fills an empty, migrated database."""
    monday = _monday(now.astimezone(ZoneInfo(ZONE)).date())
    password_hash = crypto.hash_password(PASSWORD)
    async with factory() as db:
        calendars: dict[uuid.UUID, uuid.UUID] = {}
        for account in ACCOUNTS:
            db.add(
                UserAccount(
                    id=account.id,
                    email=account.email,
                    password_hash=password_hash,
                    display_name=account.display_name,
                    time_zone=ZONE,
                    role="user",
                    email_verified_at=now,
                )
            )
            await db.flush()
            calendars[account.id] = (await create_default_calendar(db, account.id)).id

        await _as_user(db, MIRA)
        team_batch = _Batch()
        team = team_batch.add("calendar", {"name": "Team", "color": "orange"})
        await _push(db, MIRA, team_batch)
        mira = _Batch()
        board = _mira_data(mira, calendars[MIRA.id], team, monday)
        await _push(db, MIRA, mira)
        for kind, container in (("calendar", team), ("board", board)):
            await create_share(
                db,
                MIRA.id,
                container_kind=kind,  # type: ignore[arg-type]
                container_id=container,
                grantee_email=ALEX.email,
                permission="edit",
            )

        await _as_user(db, ALEX)
        alex = _Batch()
        _alex_data(alex, calendars[ALEX.id], monday)
        await _push(db, ALEX, alex)
        await db.commit()
