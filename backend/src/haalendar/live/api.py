"""`GET /stream` — Server-Sent Events for the signed-in user (contract: api/modules/sync.yaml — openEventStream).

+++===+++ 2026-10-22 — Hasan Alizada — HAAL-055.
- Authenticated by the session cookie with a short database session of its own (no connection is held while the
  stream is open). The first event is `changes`, so a client that was away catches up with its cursor pull.
- Events: `changes` (run a sync), `notification` (a new notification), `ping` every PING_SECONDS. Before each ping the
  session is checked without sliding its expiry; a revoked or expired session ends the stream (the reconnect then gets
  401 and the client pauses).
- `retry: 5000` for the browser's reconnect; `X-Accel-Buffering: no` and `Cache-Control: no-store` so proxies pass
  events at once.
"""

from __future__ import annotations

import time
import uuid
from collections.abc import AsyncIterator

from fastapi import APIRouter, Request
from sse_starlette import EventSourceResponse, ServerSentEvent

from haalendar.accounts import service
from haalendar.config import Settings
from haalendar.deps import SESSION_COOKIE
from haalendar.errors import ProblemCode, ProblemError
from haalendar.live.hub import Hub, Stream
from haalendar.logging import get_logger

log = get_logger(__name__)

router = APIRouter(tags=["sync"])

PING_SECONDS = 25.0
RETRY_MS = 5000


@router.get("/stream", operation_id="openEventStream", response_class=EventSourceResponse)
async def open_event_stream(request: Request) -> EventSourceResponse:
    settings: Settings = request.app.state.settings
    hub: Hub = request.app.state.live_hub
    token = request.cookies.get(SESSION_COOKIE)
    async with request.app.state.session_factory() as db:
        resolved = await service.resolve_session(db, settings, token) if token else None
        await db.commit()
    if resolved is None:
        raise ProblemError(401, ProblemCode.SESSION_EXPIRED, "Sign in to continue")
    session, user = resolved
    if user.must_change_password:
        raise ProblemError(403, ProblemCode.PASSWORD_CHANGE_REQUIRED, "Set a new password to continue")
    stream = hub.open(user.id)
    request.app.state.metrics.live_connections.set(hub.count)
    log.info("live_stream_opened", user_id=str(user.id), streams=hub.count)
    return EventSourceResponse(
        _events(request, hub, stream, session.id),
        headers={"X-Accel-Buffering": "no", "Cache-Control": "no-store"},
        ping=None,
    )


async def _events(
    request: Request, hub: Hub, stream: Stream, session_id: uuid.UUID
) -> AsyncIterator[ServerSentEvent]:
    started, reason = time.monotonic(), "client_closed"
    checked = started
    try:
        yield ServerSentEvent(event="changes", data="{}", retry=RETRY_MS)
        while True:
            events = await stream.next_events(PING_SECONDS)
            for event in events:
                yield ServerSentEvent(event=event, data="{}")
            if time.monotonic() - checked < PING_SECONDS - 1:
                continue
            checked = time.monotonic()
            async with request.app.state.session_factory() as db:
                active = await service.session_is_active(db, session_id)
            if not active:
                reason = "session_ended"
                return
            if not events:
                yield ServerSentEvent(event="ping", data="{}")
    finally:
        hub.close(stream)
        request.app.state.metrics.live_connections.set(hub.count)
        log.info(
            "live_stream_closed",
            user_id=str(stream.user_id),
            reason=reason,
            seconds=round(time.monotonic() - started),
            streams=hub.count,
        )
