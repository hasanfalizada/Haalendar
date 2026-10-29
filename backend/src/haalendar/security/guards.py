"""Pure ASGI request guards: Host allow-list, rate limiting, body size and content-type limits, CSRF origin check.

+++===+++ 2026-10-15 — Hasan Alizada — HAAL-020. Each guard rejects early, before routing and before reading a large
body, and answers with an RFC 9457 problem (application/problem+json). Order (outermost first, after the request
context middleware): Host → rate limit → body/content-type → CSRF origin.
ASVS 5.0: V4 (API), V3 (frontend: CSRF), V13 (configuration); API Top 10: API4 (resource consumption), API8.
"""

from __future__ import annotations

import json
import math
import re
import time
from collections import OrderedDict
from dataclasses import dataclass
from http import HTTPStatus

from starlette.types import ASGIApp, Message, Receive, Scope, Send

from haalendar.errors import ProblemCode
from haalendar.logging import get_logger
from haalendar.security.uploads import (
    ATTACHMENT_PATH,
    ATTACHMENT_TYPES,
    AVATAR_PATH,
    AVATAR_TYPES,
    ICS_IMPORT_PATH,
    ICS_TYPES,
    MAX_AVATAR_BYTES,
    MAX_ICS_BYTES,
    MAX_IMAGE_BYTES,
)

log = get_logger(__name__)

UNSAFE_METHODS = frozenset({"POST", "PUT", "PATCH", "DELETE"})
ALLOWED_BODY_TYPES = ("application/json", "application/merge-patch+json", "multipart/form-data")
RATE_LIMIT_EXEMPT_PREFIXES = ("/api/v1/health/",)
AUTH_PREFIX = "/api/v1/auth/"


@dataclass(frozen=True, slots=True)
class BodyRule:
    """Per-path body limit and accepted content types (upload endpoints)."""

    max_bytes: int
    content_types: tuple[str, ...]


# +++===+++ 2026-10-15 — Hasan Alizada — HAAL-166. Upload endpoints get their own limit and only their media types.
BODY_RULES: dict[str, BodyRule] = {AVATAR_PATH: BodyRule(MAX_AVATAR_BYTES, AVATAR_TYPES)}
# +++===+++ 2026-10-17 — Hasan Alizada — HAAL-040. Paths with an id in them (attachment upload: 10 MB, four image types).
BODY_RULE_PATTERNS: tuple[tuple[re.Pattern[str], BodyRule], ...] = (
    (ATTACHMENT_PATH, BodyRule(MAX_IMAGE_BYTES, ATTACHMENT_TYPES)),
    # +++===+++ 2026-10-29 — Hasan Alizada — HAAL-095. ICS import: 5 MB, text/calendar.
    (ICS_IMPORT_PATH, BodyRule(MAX_ICS_BYTES, ICS_TYPES)),
)


def body_rule(path: str) -> BodyRule | None:
    rule = BODY_RULES.get(path)
    if rule is not None:
        return rule
    return next((r for pattern, r in BODY_RULE_PATTERNS if pattern.match(path)), None)


def _header(scope: Scope, name: bytes) -> str:
    for key, value in scope.get("headers") or []:
        if key == name:
            return str(value.decode("latin-1"))
    return ""


async def send_problem(
    scope: Scope,
    send: Send,
    status: int,
    code: ProblemCode,
    detail: str,
    extra_headers: list[tuple[bytes, bytes]] | None = None,
) -> None:
    """Problem response at ASGI level (outside FastAPI handlers); mirrors errors.problem_response()."""
    body = json.dumps(
        {
            "type": f"/problems/{code.value}",
            "title": HTTPStatus(status).phrase,
            "status": status,
            "code": code.value,
            "detail": detail,
            "instance": scope.get("path", ""),
            "request_id": scope.get("state", {}).get("request_id"),
        }
    ).encode()
    headers = [(b"content-type", b"application/problem+json"), (b"content-length", str(len(body)).encode())]
    headers.extend(extra_headers or [])
    await send({"type": "http.response.start", "status": status, "headers": headers})
    await send({"type": "http.response.body", "body": body})


class HostGuard:
    """Rejects requests whose Host header is not allowed (host-header injection, DNS rebinding)."""

    def __init__(self, app: ASGIApp, allowed_hosts: frozenset[str]) -> None:
        self.app = app
        self.allowed_hosts = allowed_hosts

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return
        raw_host = _header(scope, b"host").lower()
        host = raw_host[1 : raw_host.index("]")] if raw_host.startswith("[") and "]" in raw_host else raw_host
        host = host.rsplit(":", 1)[0] if host.count(":") == 1 else host
        if host not in self.allowed_hosts:
            log.warning("host_rejected", host=raw_host[:100])
            await send_problem(scope, send, 400, ProblemCode.BAD_REQUEST, "Host not allowed")
            return
        await self.app(scope, receive, send)


@dataclass(slots=True)
class _Bucket:
    tokens: float
    updated: float


class TokenBucketLimiter:
    """In-memory token bucket per client key with bounded memory (LRU of at most `max_clients` keys).

    Per-process: with several app replicas each enforces its own budget, which is acceptable for the baseline;
    login endpoints get stricter limits and account lockout in HAAL-162.
    """

    def __init__(self, per_minute: int, burst: int, max_clients: int = 10_000) -> None:
        self.rate = per_minute / 60.0
        self.burst = float(burst)
        self.max_clients = max_clients
        self._buckets: OrderedDict[str, _Bucket] = OrderedDict()

    def take(self, key: str, now: float | None = None) -> tuple[bool, float]:
        """Consume one token. Returns (allowed, seconds until the next token is available)."""
        now = time.monotonic() if now is None else now
        bucket = self._buckets.get(key)
        if bucket is None:
            bucket = _Bucket(tokens=self.burst, updated=now)
            self._buckets[key] = bucket
            if len(self._buckets) > self.max_clients:
                self._buckets.popitem(last=False)
        else:
            self._buckets.move_to_end(key)
            bucket.tokens = min(self.burst, bucket.tokens + (now - bucket.updated) * self.rate)
            bucket.updated = now
        if bucket.tokens >= 1.0:
            bucket.tokens -= 1.0
            return True, 0.0
        return False, (1.0 - bucket.tokens) / self.rate if self.rate > 0 else 60.0


class RateLimitGuard:
    """429 with Retry-After and IETF RateLimit/RateLimit-Policy headers when a client exceeds its budget."""

    def __init__(
        self, app: ASGIApp, per_minute: int, burst: int, auth_per_minute: int = 0, auth_burst: int = 1
    ) -> None:
        self.app = app
        self.enabled = per_minute > 0
        self.per_minute = per_minute
        self.limiter = TokenBucketLimiter(per_minute, burst) if self.enabled else None
        # +++===+++ 2026-10-15 — Hasan Alizada — HAAL-162. Second, stricter bucket for authentication endpoints
        # (credential stuffing, reset/registration abuse); consumed in addition to the general bucket.
        self.auth_per_minute = auth_per_minute
        self.auth_limiter = TokenBucketLimiter(auth_per_minute, auth_burst) if auth_per_minute > 0 else None

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        path: str = scope.get("path", "")
        if scope["type"] != "http" or path.startswith(RATE_LIMIT_EXEMPT_PREFIXES):
            await self.app(scope, receive, send)
            return
        client = scope.get("client")
        key = client[0] if client else "unknown"
        allowed, retry_after, policy = True, 0.0, self.per_minute
        if self.limiter is not None:
            allowed, retry_after = self.limiter.take(key)
        if allowed and self.auth_limiter is not None and path.startswith(AUTH_PREFIX):
            allowed, retry_after = self.auth_limiter.take(key)
            policy = self.auth_per_minute
        if not allowed:
            wait = max(1, math.ceil(retry_after))
            log.warning("rate_limited", client=key, retry_after_seconds=wait)
            await send_problem(
                scope,
                send,
                429,
                ProblemCode.RATE_LIMITED,
                "Too many requests. Try again later.",
                [
                    (b"retry-after", str(wait).encode()),
                    (b"ratelimit-policy", f'"default";q={policy};w=60'.encode()),
                    (b"ratelimit", f'"default";r=0;t={wait}'.encode()),
                ],
            )
            return
        await self.app(scope, receive, send)


class BodyGuard:
    """Limits request body size (Content-Length and streamed) and accepted content types for unsafe methods."""

    def __init__(self, app: ASGIApp, max_body_bytes: int) -> None:
        self.app = app
        self.max_body_bytes = max_body_bytes

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http" or scope.get("method") not in UNSAFE_METHODS:
            await self.app(scope, receive, send)
            return
        rule = body_rule(scope.get("path", ""))
        limit = rule.max_bytes if rule else self.max_body_bytes
        allowed_types = rule.content_types if rule else ALLOWED_BODY_TYPES
        length_header = _header(scope, b"content-length")
        if length_header.isdigit() and int(length_header) > limit:
            log.warning("body_too_large", content_length=int(length_header), limit=limit)
            await send_problem(scope, send, 413, ProblemCode.PAYLOAD_TOO_LARGE, "Request body is too large")
            return
        has_body = (length_header.isdigit() and int(length_header) > 0) or "chunked" in _header(
            scope, b"transfer-encoding"
        )
        content_type = _header(scope, b"content-type").split(";", 1)[0].strip().lower()
        if has_body and content_type not in allowed_types:
            log.warning("unsupported_media_type", content_type=content_type[:100])
            await send_problem(
                scope, send, 415, ProblemCode.UNSUPPORTED_MEDIA_TYPE, "Unsupported content type"
            )
            return

        # Streamed bodies (no Content-Length): stop feeding the app once the limit is crossed and replace whatever
        # response it produces (typically a parse error) with 413. Raising from receive() does not work because
        # FastAPI converts exceptions during body reading into 400.
        received = 0
        exceeded = False
        replaced = False

        async def limited_receive() -> Message:
            nonlocal received, exceeded
            if exceeded:
                return {"type": "http.request", "body": b"", "more_body": False}
            message = await receive()
            if message["type"] == "http.request":
                received += len(message.get("body", b""))
                if received > limit:
                    exceeded = True
                    log.warning("body_too_large_streamed", received=received, limit=limit)
                    return {"type": "http.request", "body": b"", "more_body": False}
            return message

        async def guarded_send(message: Message) -> None:
            nonlocal replaced
            if not exceeded:
                await send(message)
                return
            if not replaced and message["type"] == "http.response.start":
                replaced = True
                await send_problem(
                    scope, send, 413, ProblemCode.PAYLOAD_TOO_LARGE, "Request body is too large"
                )
            # Every other message of the app's own response is dropped.

        await self.app(scope, limited_receive, guarded_send)


class CsrfOriginGuard:
    """Rejects cross-site unsafe requests by Fetch Metadata and Origin (defence in depth with SameSite cookies
    and the per-session CSRF token added in HAAL-160). Non-browser clients send neither header and pass here."""

    def __init__(self, app: ASGIApp, allowed_origins: frozenset[str]) -> None:
        self.app = app
        self.allowed_origins = allowed_origins

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http" or scope.get("method") not in UNSAFE_METHODS:
            await self.app(scope, receive, send)
            return
        fetch_site = _header(scope, b"sec-fetch-site").lower()
        origin = _header(scope, b"origin").rstrip("/").lower()
        if fetch_site == "cross-site" or (origin and origin != "null" and origin not in self.allowed_origins):
            log.warning("csrf_origin_rejected", origin=origin[:100], fetch_site=fetch_site)
            await send_problem(scope, send, 403, ProblemCode.CSRF_FAILED, "Cross-site request rejected")
            return
        if origin == "null":
            log.warning("csrf_origin_rejected", origin="null", fetch_site=fetch_site)
            await send_problem(scope, send, 403, ProblemCode.CSRF_FAILED, "Cross-site request rejected")
            return
        await self.app(scope, receive, send)
