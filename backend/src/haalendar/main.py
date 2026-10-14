"""ASGI application factory and process entry point.

+++===+++ 2026-10-14 — Hasan Alizada — HAAL-016. create_app() wires settings, logging, database engine (lifespan),
error handlers, middleware and routers. run() starts uvicorn without the Server header and with trusted proxies only.
"""

from __future__ import annotations

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

import uvicorn
from fastapi import FastAPI

from haalendar import __version__
from haalendar.api import health
from haalendar.config import Environment, Settings, get_settings
from haalendar.db import create_engine, create_session_factory
from haalendar.errors import install_error_handlers
from haalendar.logging import configure_logging, get_logger
from haalendar.middleware import RequestContextMiddleware

log = get_logger(__name__)

API_PREFIX = "/api/v1"


def create_app(settings: Settings | None = None) -> FastAPI:
    settings = settings or get_settings()
    configure_logging(settings)

    @asynccontextmanager
    async def lifespan(app: FastAPI) -> AsyncIterator[None]:
        engine = create_engine(settings)
        app.state.engine = engine
        app.state.session_factory = create_session_factory(engine)
        log.info("app_started", version=__version__, env=settings.env.value, demo_mode=settings.demo_mode)
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
    install_error_handlers(app)
    app.add_middleware(RequestContextMiddleware, settings=settings)
    app.include_router(health.router, prefix=API_PREFIX)
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
