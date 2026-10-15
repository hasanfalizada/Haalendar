"""ASGI application factory and process entry point.

+++===+++ 2026-10-14 — Hasan Alizada — HAAL-016. create_app() wires settings, logging, database engine (lifespan),
error handlers, middleware and routers. run() starts uvicorn without the Server header and with trusted proxies only.
+++===+++ 2026-10-15 — Hasan Alizada — HAAL-019. Metrics registry, DB pool gauges, slow-query logging and the
token-protected /metrics endpoint are wired here.
+++===+++ 2026-10-15 — Hasan Alizada — HAAL-020. Security guards (Host, rate limit, body/content-type, CSRF origin).
+++===+++ 2026-10-15 — Hasan Alizada — HAAL-160. Accounts routers (register, verify e-mail, login, logout, me) and mailer.
+++===+++ 2026-10-15 — Hasan Alizada — HAAL-166. File storage (local adapter) and the users router (avatars).
"""

from __future__ import annotations

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

import uvicorn
from fastapi import FastAPI

from haalendar import __version__
from haalendar.accounts.api import admin_router, auth_router, me_router, setup_router, users_router
from haalendar.accounts.mailer import create_mailer
from haalendar.api import health
from haalendar.config import Environment, Settings, get_settings
from haalendar.db import create_engine, create_session_factory, role_bypasses_rls
from haalendar.errors import install_error_handlers
from haalendar.logging import configure_logging, get_logger
from haalendar.middleware import RequestContextMiddleware
from haalendar.observability import Metrics, attach_slow_query_logging, install_metrics_endpoint
from haalendar.security.guards import BodyGuard, CsrfOriginGuard, HostGuard, RateLimitGuard
from haalendar.storage import create_storage

log = get_logger(__name__)

API_PREFIX = "/api/v1"


def create_app(settings: Settings | None = None) -> FastAPI:
    settings = settings or get_settings()
    configure_logging(settings)
    metrics = Metrics(settings)

    @asynccontextmanager
    async def lifespan(app: FastAPI) -> AsyncIterator[None]:
        engine = create_engine(settings)
        app.state.engine = engine
        app.state.session_factory = create_session_factory(engine)
        metrics.register_pool(engine)
        attach_slow_query_logging(engine, settings.db_slow_query_ms, metrics)
        # +++===+++ 2026-10-15 — Hasan Alizada — HAAL-165. Refuse to serve production data through a role that ignores
        # row-level security; elsewhere warn (the database may also be unreachable at startup: readiness reports it).
        if await role_bypasses_rls(engine):
            if settings.env is Environment.PRODUCTION:
                await engine.dispose()
                log.error("db_role_bypasses_rls")
                raise RuntimeError(
                    "HAALENDAR_DATABASE_URL uses a superuser or BYPASSRLS role; run haalendar-db-bootstrap and "
                    "connect as the application role"
                )
            log.warning("db_role_bypasses_rls")
        log.info(
            "app_started",
            version=__version__,
            env=settings.env.value,
            demo_mode=settings.demo_mode,
            mail_mode=type(app.state.mailer).__name__,
        )
        try:
            yield
        finally:
            await engine.dispose()
            log.info("app_stopped")

    is_dev = settings.env is Environment.DEVELOPMENT
    app = FastAPI(
        title="Haalendar API",
        version=__version__,
        lifespan=lifespan,
        # Interactive docs only in development; the published contract lives in api/openapi.yaml.
        docs_url=f"{API_PREFIX}/docs" if is_dev else None,
        redoc_url=None,
        openapi_url=f"{API_PREFIX}/openapi.json" if is_dev else None,
    )
    app.state.settings = settings
    app.state.metrics = metrics
    app.state.mailer = create_mailer(settings)
    app.state.storage = create_storage(settings)
    install_error_handlers(app)
    # Starlette runs the last added middleware first: request context (ids, headers, logging) wraps every guard,
    # so rejections still carry X-Request-ID, security headers and a log line.
    app.add_middleware(CsrfOriginGuard, allowed_origins=settings.allowed_origins)
    app.add_middleware(BodyGuard, max_body_bytes=settings.max_request_body_bytes)
    app.add_middleware(
        RateLimitGuard,
        per_minute=settings.rate_limit_per_minute,
        burst=settings.rate_limit_burst,
        auth_per_minute=settings.auth_rate_limit_per_minute,
        auth_burst=settings.auth_rate_limit_burst,
    )
    app.add_middleware(HostGuard, allowed_hosts=settings.allowed_hosts)
    app.add_middleware(RequestContextMiddleware, settings=settings, metrics=metrics)
    app.include_router(health.router, prefix=API_PREFIX)
    app.include_router(auth_router, prefix=API_PREFIX)
    app.include_router(me_router, prefix=API_PREFIX)
    app.include_router(admin_router, prefix=API_PREFIX)
    app.include_router(setup_router, prefix=API_PREFIX)
    app.include_router(users_router, prefix=API_PREFIX)
    install_metrics_endpoint(app, settings, metrics)
    return app


def run() -> None:
    """Console entry point `haalendar-api`."""
    settings = get_settings()
    uvicorn.run(
        "haalendar.main:create_app",
        factory=True,
        host=settings.bind_host,
        port=settings.port,
        proxy_headers=True,
        forwarded_allow_ips=settings.forwarded_allow_ips,
        server_header=False,
        access_log=False,
        log_config=None,
    )
