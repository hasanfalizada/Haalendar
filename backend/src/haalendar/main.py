"""ASGI application factory and process entry point.

+++===+++ 2026-10-14 — Hasan Alizada — HAAL-016. create_app() wires settings, logging, database engine (lifespan),
error handlers, middleware and routers. run() starts uvicorn without the Server header and with trusted proxies only.
+++===+++ 2026-10-15 — Hasan Alizada — HAAL-019. Metrics registry, DB pool gauges, slow-query logging and the
token-protected /metrics endpoint are wired here.
+++===+++ 2026-10-15 — Hasan Alizada — HAAL-020. Security guards (Host, rate limit, body/content-type, CSRF origin).
+++===+++ 2026-10-15 — Hasan Alizada — HAAL-160. Accounts routers (register, verify e-mail, login, logout, me) and mailer.
+++===+++ 2026-10-15 — Hasan Alizada — HAAL-166. File storage (local adapter) and the users router (avatars).
+++===+++ 2026-10-15 — Hasan Alizada — HAAL-167. Sharing router.
+++===+++ 2026-10-16 — Hasan Alizada — HAAL-033. Trash router.
+++===+++ 2026-10-16 — Hasan Alizada — HAAL-036. Bulk router.
+++===+++ 2026-10-17 — Hasan Alizada — HAAL-040. Attachment routers.
+++===+++ 2026-10-18 — Hasan Alizada — HAAL-043. Export router; the job queue is opened for the app's lifetime.
+++===+++ 2026-10-22 — Hasan Alizada — HAAL-055. Live updates: the stream hub, the LISTEN task for the app's lifetime and
the /stream router.
"""

from __future__ import annotations

import asyncio
import contextlib
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

import uvicorn
from fastapi import FastAPI

from haalendar import __version__
from haalendar.accounts.api import admin_router, auth_router, me_router, setup_router, users_router
from haalendar.accounts.mailer import create_mailer
from haalendar.api import health
from haalendar.attachments.api import items_router as attachment_items_router
from haalendar.attachments.api import router as attachments_router
from haalendar.bulk.api import router as bulk_router
from haalendar.config import Environment, Settings, get_settings
from haalendar.db import create_engine, create_session_factory, role_bypasses_rls
from haalendar.errors import install_error_handlers
from haalendar.exports.api import router as exports_router
from haalendar.jobs import JobQueue
from haalendar.live.api import router as live_router
from haalendar.live.hub import Hub
from haalendar.live.listener import listen
from haalendar.logging import configure_logging, get_logger
from haalendar.middleware import RequestContextMiddleware
from haalendar.notifications.api import router as notifications_router
from haalendar.observability import Metrics, attach_slow_query_logging, install_metrics_endpoint
from haalendar.planning.ics_api import router as ics_router
from haalendar.preferences.api import router as settings_router
from haalendar.push.api import router as push_router
from haalendar.security.guards import BodyGuard, CsrfOriginGuard, HostGuard, RateLimitGuard
from haalendar.sharing.api import router as sharing_router
from haalendar.storage import create_storage
from haalendar.sync.api import router as sync_router
from haalendar.trash.api import router as trash_router

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
        jobs = JobQueue(settings)
        app.state.jobs = jobs
        listener = asyncio.create_task(listen(app.state.live_hub, app.state.session_factory, settings))
        try:
            yield
        finally:
            listener.cancel()
            with contextlib.suppress(asyncio.CancelledError):
                await listener
            await jobs.close()
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
    app.state.live_hub = Hub()
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
    app.include_router(sharing_router, prefix=API_PREFIX)
    app.include_router(trash_router, prefix=API_PREFIX)
    app.include_router(bulk_router, prefix=API_PREFIX)
    app.include_router(push_router, prefix=API_PREFIX)  # +++===+++ 2026-10-28 — Hasan Alizada — HAAL-091
    app.include_router(attachment_items_router, prefix=API_PREFIX)
    app.include_router(attachments_router, prefix=API_PREFIX)
    app.include_router(exports_router, prefix=API_PREFIX)
    app.include_router(settings_router, prefix=API_PREFIX)
    app.include_router(notifications_router, prefix=API_PREFIX)
    app.include_router(sync_router, prefix=API_PREFIX)
    app.include_router(ics_router, prefix=API_PREFIX)  # +++===+++ 2026-10-29 — Hasan Alizada — HAAL-095
    app.include_router(live_router, prefix=API_PREFIX)
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
