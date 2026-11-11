"""The open event streams of this process and the events waiting for them (ADR-0009, D-59).

+++===+++ 2026-10-22 — Hasan Alizada — HAAL-055.
- One `Stream` per open `/stream` connection; at most PER_USER per user and TOTAL per process (more → 429).
- Events carry no data: a stream keeps the set of event names waiting (`changes`, `notification`), so a burst of
  changes becomes one event, and the endpoint waits COALESCE_SECONDS after a wake-up to gather the rest of a burst.
"""

from __future__ import annotations

import asyncio
import uuid
from collections.abc import Iterable

from haalendar.errors import ProblemCode, ProblemError

PER_USER = 10
TOTAL = 1000
COALESCE_SECONDS = 0.25


class Stream:
    def __init__(self, user_id: uuid.UUID) -> None:
        self.user_id = user_id
        self.pending: set[str] = set()
        self._wake = asyncio.Event()

    def push(self, event: str) -> None:
        self.pending.add(event)
        self._wake.set()

    async def next_events(self, within: float) -> list[str]:
        """The events waiting (sorted), gathered over a short burst; empty when nothing came within `within` s."""
        try:
            await asyncio.wait_for(self._wake.wait(), within)
        except TimeoutError:
            return []
        await asyncio.sleep(COALESCE_SECONDS)
        self._wake.clear()
        events, self.pending = sorted(self.pending), set()
        return events


class Hub:
    def __init__(self, per_user: int = PER_USER, total: int = TOTAL) -> None:
        self.per_user, self.total = per_user, total
        self._streams: dict[uuid.UUID, set[Stream]] = {}

    @property
    def count(self) -> int:
        return sum(len(streams) for streams in self._streams.values())

    def users(self) -> frozenset[uuid.UUID]:
        return frozenset(self._streams)

    def open(self, user_id: uuid.UUID) -> Stream:
        mine = self._streams.get(user_id, set())
        if len(mine) >= self.per_user or self.count >= self.total:
            raise ProblemError(429, ProblemCode.RATE_LIMITED, "Too many open live connections")
        stream = Stream(user_id)
        self._streams.setdefault(user_id, set()).add(stream)
        return stream

    def close(self, stream: Stream) -> None:
        mine = self._streams.get(stream.user_id)
        if mine is not None:
            mine.discard(stream)
            if not mine:
                del self._streams[stream.user_id]

    def publish(self, user_ids: Iterable[uuid.UUID], event: str) -> int:
        """Wakes the streams of these users; returns how many streams were told."""
        told = 0
        for user_id in set(user_ids):
            for stream in self._streams.get(user_id, ()):
                stream.push(event)
                told += 1
        return told

    def publish_all(self, event: str) -> int:
        return self.publish(self._streams, event)
