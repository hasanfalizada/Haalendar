"""Metrics (Prometheus text format) and database slow-query logging.

+++===+++ 2026-10-15 — Hasan Alizada — HAAL-019. Low-cardinality HTTP metrics labelled by route template (never by
raw path or user data), DB pool gauges, build info. /metrics is disabled by default and, when enabled, requires a
bearer token (instructions Section J: private endpoints must not be public). Slow SQL statements are logged without
bound parameters (they may contain user data).
"""

from __future__ import annotations

import hmac
import time
from collections.abc import Iterator, MutableMapping
from typing import Any

from fastapi import FastAPI, Request
from fastapi.responses import Response
from prometheus_client import CollectorRegistry, Counter, Gauge, Histogram, Info, generate_latest
from prometheus_client.core import GaugeMetricFamily
from prometheus_client.exposition import CONTENT_TYPE_LATEST
from prometheus_client.registry import Collector
from sqlalchemy import event
from sqlalchemy.engine import Connection, ExecutionContext
from sqlalchemy.ext.asyncio import AsyncEngine

from haalendar import __version__
from haalendar.config import Settings
from haalendar.errors import ProblemCode, ProblemError
from haalendar.logging import get_logger

log = get_logger(__name__)

UNMATCHED_ROUTE = "unmatched"
# Buckets around the SLO (p95 ≤ 200 ms, p99 ≤ 500 ms; SRS 4.1).
LATENCY_BUCKETS = (0.005, 0.01, 0.025, 0.05, 0.1, 0.2, 0.3, 0.5, 1.0, 2.5, 5.0)
MAX_LOGGED_SQL_CHARS = 300


class Metrics:
    """All application metrics in a private registry (isolated per app instance and per test)."""

    def __init__(self, settings: Settings) -> None:
        self.registry = CollectorRegistry(auto_describe=True)
        self.requests = Counter(
            "haalendar_http_requests",
            "HTTP requests by method, route template and status code.",
            ["method", "route", "status"],
            registry=self.registry,
        )
        self.latency = Histogram(
            "haalendar_http_request_duration_seconds",
            "HTTP request duration by method and route template.",
            ["method", "route"],
            buckets=LATENCY_BUCKETS,
            registry=self.registry,
        )
        self.in_progress = Gauge(
            "haalendar_http_requests_in_progress", "HTTP requests being processed.", registry=self.registry
        )
        self.slow_queries = Counter(
            "haalendar_db_slow_queries",
            "SQL statements slower than the configured threshold.",
            registry=self.registry,
        )
        info = Info("haalendar_build", "Build and runtime information.", registry=self.registry)
        info.info({"version": __version__, "env": settings.env.value})

    def observe_request(self, method: str, route: str, status: int, duration_seconds: float) -> None:
        self.requests.labels(method=method, route=route, status=str(status)).inc()
        self.latency.labels(method=method, route=route).observe(duration_seconds)

    def register_pool(self, engine: AsyncEngine) -> None:
        self.registry.register(_PoolCollector(engine))

    def render(self) -> bytes:
        return generate_latest(self.registry)


class _PoolCollector(Collector):
    """Reads SQLAlchemy QueuePool counters at scrape time (no background work)."""

    def __init__(self, engine: AsyncEngine) -> None:
        self._engine = engine

    def collect(self) -> Iterator[GaugeMetricFamily]:
        pool: Any = self._engine.sync_engine.pool
        for name, help_text, getter in (
            ("haalendar_db_pool_size", "Configured pool size.", "size"),
            ("haalendar_db_pool_checked_out", "Connections currently in use.", "checkedout"),
            ("haalendar_db_pool_overflow", "Connections above pool size.", "overflow"),
        ):
            reader = getattr(pool, getter, None)
            if callable(reader):
                yield GaugeMetricFamily(name, help_text, value=float(reader()))


def route_template(scope: MutableMapping[str, Any]) -> str:
    """Full route template of the matched route, e.g. /api/v1/events/{id}; never the raw URL.

    FastAPI 0.143 keeps the include_router prefix out of route.path, so the static prefix is recovered by
    removing the concrete (parameter-substituted) route suffix from the request path.
    """
    route = scope.get("route")
    template = getattr(route, "path", None)
    path_format = getattr(route, "path_format", None)
    if not isinstance(template, str) or not isinstance(path_format, str):
        return UNMATCHED_ROUTE
    full_path: str = scope.get("path", "")
    try:
        concrete = path_format.format(**scope.get("path_params", {}))
    except KeyError, IndexError, ValueError:
        return template
    prefix = full_path[: -len(concrete)] if concrete and full_path.endswith(concrete) else ""
    return prefix + template


def attach_slow_query_logging(engine: AsyncEngine, threshold_ms: int, metrics: Metrics | None = None) -> None:
    """Log a warning for every statement slower than `threshold_ms` (0 disables)."""
    if threshold_ms <= 0:
        return
    sync_engine = engine.sync_engine

    @event.listens_for(sync_engine, "before_cursor_execute")
    def _before(
        conn: Connection,
        cursor: Any,
        statement: str,
        parameters: Any,
        context: ExecutionContext,
        executemany: bool,
    ) -> None:
        conn.info.setdefault("haalendar_query_start", []).append(time.perf_counter())

    @event.listens_for(sync_engine, "after_cursor_execute")
    def _after(
        conn: Connection,
        cursor: Any,
        statement: str,
        parameters: Any,
        context: ExecutionContext,
        executemany: bool,
    ) -> None:
        starts: list[float] = conn.info.get("haalendar_query_start", [])
        if not starts:
            return
        elapsed_ms = (time.perf_counter() - starts.pop()) * 1000
        log_if_slow(statement, elapsed_ms, threshold_ms, metrics)

    log.info("slow_query_logging_enabled", threshold_ms=threshold_ms)


def log_if_slow(statement: str, elapsed_ms: float, threshold_ms: int, metrics: Metrics | None = None) -> bool:
    """Emit the slow-query warning; only the SQL text (truncated) is logged, never bound parameters."""
    if elapsed_ms < threshold_ms:
        return False
    compact = " ".join(statement.split())
    log.warning(
        "db_slow_query",
        duration_ms=round(elapsed_ms, 1),
        threshold_ms=threshold_ms,
        statement=compact[:MAX_LOGGED_SQL_CHARS],
    )
    if metrics is not None:
        metrics.slow_queries.inc()
    return True


def install_metrics_endpoint(app: FastAPI, settings: Settings, metrics: Metrics) -> None:
    """Mount GET /metrics (outside /api/v1, not part of the public API contract) when enabled."""
    if not settings.metrics_enabled or settings.metrics_token is None:
        log.info("metrics_endpoint_disabled")
        return
    expected = f"Bearer {settings.metrics_token.get_secret_value()}".encode()

    @app.get("/metrics", include_in_schema=False)
    async def metrics_endpoint(request: Request) -> Response:
        provided = request.headers.get("authorization", "").encode()
        if not hmac.compare_digest(provided, expected):
            log.warning("metrics_unauthorized")
            raise ProblemError(401, ProblemCode.SESSION_EXPIRED, "Metrics require a valid bearer token")
        return Response(metrics.render(), media_type=CONTENT_TYPE_LATEST)

    log.info("metrics_endpoint_enabled", path="/metrics")
