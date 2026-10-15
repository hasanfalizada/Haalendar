"""Pure ASGI middleware: request correlation id, access log, security headers, last-resort error handling.

+++===+++ 2026-10-14 — Hasan Alizada — HAAL-016. Implemented as raw ASGI (not BaseHTTPMiddleware) so that streaming
responses (SSE, file downloads) are not buffered. Security headers follow the API security checklist (instructions
Section J) and are added to every response, including unhandled 500 errors.
"""

from __future__ import annotations

import json
import re
import time
import uuid
from typing import Any

import structlog
from starlette.types import ASGIApp, Message, Receive, Scope, Send

from haalendar.config import Settings
from haalendar.logging import get_logger
from haalendar.observability import Metrics, route_template

log = get_logger(__name__)

REQUEST_ID_HEADER = "x-request-id"

# +++===+++ 2026-10-15 — Hasan Alizada — HAAL-020. API responses never render; the SPA (served by this app from HAAL-150)
# gets a strict same-origin policy: no inline scripts, no eval, no framing, no plugins. Radix UI sets style attributes,
# hence style-src-attr 'unsafe-inline' only (not style elements or scripts). ASVS 5.0 V3.
API_CSP = b"default-src 'none'; frame-ancestors 'none'"
SPA_CSP = (
    b"default-src 'self'; script-src 'self'; style-src 'self'; style-src-attr 'unsafe-inline'; "
    b"img-src 'self' data: blob:; font-src 'self'; connect-src 'self'; worker-src 'self'; manifest-src 'self'; "
    b"object-src 'none'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'"
)
_VALID_REQUEST_ID = re.compile(r"^[A-Za-z0-9._-]{1,64}$")


def security_headers(path: str, settings: Settings) -> list[tuple[bytes, bytes]]:
    """Headers added to every HTTP response; API paths get the strict API CSP and no caching."""
    headers: list[tuple[bytes, bytes]] = [
        (b"x-content-type-options", b"nosniff"),
        (b"referrer-policy", b"no-referrer"),
        (b"cross-origin-opener-policy", b"same-origin"),
        (b"cross-origin-resource-policy", b"same-origin"),
        (b"permissions-policy", b"camera=(), microphone=(), geolocation=(), payment=(), usb=()"),
    ]
    headers.append((b"content-security-policy", API_CSP if path.startswith("/api/") else SPA_CSP))
    if settings.https and settings.hsts_max_age_seconds > 0:
        headers.append(
            (
                b"strict-transport-security",
                f"max-age={settings.hsts_max_age_seconds}; includeSubDomains".encode(),
            )
        )
    return headers


class RequestContextMiddleware:
    """Assign/propagate X-Request-ID, log one line per request, harden headers, convert crashes to RFC 9457."""

    def __init__(self, app: ASGIApp, settings: Settings, metrics: Metrics | None = None) -> None:
        self.app = app
        self.settings = settings
        self.metrics = metrics

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        incoming = dict(scope.get("headers") or []).get(REQUEST_ID_HEADER.encode(), b"").decode("latin-1")
        request_id = incoming if _VALID_REQUEST_ID.match(incoming) else uuid.uuid4().hex
        scope.setdefault("state", {})["request_id"] = request_id
        path: str = scope.get("path", "")
        method: str = scope.get("method", "")
        structlog.contextvars.bind_contextvars(request_id=request_id, method=method, path=path)

        started = time.perf_counter()
        status_holder: dict[str, int] = {"status": 0}
        response_started = False
        extra_headers = [
            (REQUEST_ID_HEADER.encode(), request_id.encode()),
            *security_headers(path, self.settings),
        ]
        no_store = path.startswith("/api/")

        async def send_wrapper(message: Message) -> None:
            nonlocal response_started
            if message["type"] == "http.response.start":
                response_started = True
                status_holder["status"] = message["status"]
                headers = list(message.get("headers", []))
                present = {name.lower() for name, _ in headers}
                headers.extend(h for h in extra_headers if h[0] not in present)
                if no_store and b"cache-control" not in present:
                    headers.append((b"cache-control", b"no-store"))
                message["headers"] = headers
            await send(message)

        if self.metrics is not None:
            self.metrics.in_progress.inc()
        try:
            await self.app(scope, receive, send_wrapper)
        except Exception as exc:
            log.exception("unhandled_exception", error_type=type(exc).__name__)
            if response_started:
                raise
            await self._send_internal_error(send_wrapper, path, request_id)
        finally:
            elapsed = time.perf_counter() - started
            duration_ms = round(elapsed * 1000, 1)
            status = status_holder["status"]
            route = route_template(scope)
            if self.metrics is not None:
                self.metrics.in_progress.dec()
                self.metrics.observe_request(method, route, status, elapsed)
            fields: dict[str, Any] = {"status": status, "duration_ms": duration_ms, "route": route}
            if status >= 500:
                log.warning("request_completed", **fields)
            else:
                log.info("request_completed", **fields)
            structlog.contextvars.clear_contextvars()

    @staticmethod
    async def _send_internal_error(send: Send, path: str, request_id: str) -> None:
        body = json.dumps(
            {
                "type": "/problems/internal_error",
                "title": "Internal Server Error",
                "status": 500,
                "code": "internal_error",
                "instance": path,
                "request_id": request_id,
            }
        ).encode()
        await send(
            {
                "type": "http.response.start",
                "status": 500,
                "headers": [
                    (b"content-type", b"application/problem+json"),
                    (b"content-length", str(len(body)).encode()),
                ],
            }
        )
        await send({"type": "http.response.body", "body": body})
