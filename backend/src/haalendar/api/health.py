"""Liveness and readiness probes (contract: api/modules/admin.yaml health_live / health_ready).

+++===+++ 2026-10-14 — Hasan Alizada — HAAL-016. Live = process answers; ready = database reachable and migrations
at head. Used by the Compose healthcheck (ADR-0004). No secrets or internal error texts are returned.
"""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse

from haalendar import __version__
from haalendar.db import check_readiness

router = APIRouter(prefix="/health", tags=["system"])


@router.get("/live", operation_id="healthLive", summary="Liveness probe")
async def live() -> dict[str, Any]:
    return {"status": "ok", "version": __version__}


@router.get(
    "/ready", operation_id="healthReady", summary="Readiness probe (database reachable, migrations applied)"
)
async def ready(request: Request) -> JSONResponse:
    result = await check_readiness(request.app.state.engine)
    body = {
        "status": "ready" if result.ready else "not_ready",
        "version": __version__,
        "checks": {
            "database": result.database,
            "migrations": result.migrations,
            "current_revision": result.current_revision,
            "expected_revision": result.expected_revision,
        },
        "latency_ms": result.latency_ms,
    }
    return JSONResponse(body, status_code=200 if result.ready else 503)
