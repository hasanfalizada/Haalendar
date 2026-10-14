"""Structured logging (structlog) with request correlation and redaction of sensitive data.

+++===+++ 2026-10-14 — Hasan Alizada — HAAL-016. JSON lines to stdout in production, readable console output in
development. Keys that may carry secrets are always redacted (instructions: never log sensitive data).
"""

from __future__ import annotations

import logging
import sys
from collections.abc import Mapping, MutableMapping
from typing import Any

import structlog

from haalendar.config import LogFormat, Settings

# Lower-case substrings of keys whose values must never reach the logs.
SENSITIVE_KEY_PARTS: tuple[str, ...] = (
    "password",
    "secret",
    "token",
    "authorization",
    "cookie",
    "csrf",
    "session",
    "totp",
    "recovery_code",
    "database_url",
    "api_key",
)
REDACTED = "[REDACTED]"


def _is_sensitive(key: str) -> bool:
    lowered = key.lower()
    return any(part in lowered for part in SENSITIVE_KEY_PARTS)


def _redact_value(value: Any) -> Any:
    """Recursively redact sensitive keys inside nested mappings and sequences."""
    if isinstance(value, Mapping):
        return {k: (REDACTED if _is_sensitive(str(k)) else _redact_value(v)) for k, v in value.items()}
    if isinstance(value, list | tuple):
        return type(value)(_redact_value(v) for v in value)
    return value


def redact_processor(
    _logger: Any, _method_name: str, event_dict: MutableMapping[str, Any]
) -> MutableMapping[str, Any]:
    """structlog processor: replace values of sensitive keys before rendering."""
    for key in list(event_dict.keys()):
        if key == "event":
            continue
        event_dict[key] = REDACTED if _is_sensitive(key) else _redact_value(event_dict[key])
    return event_dict


def configure_logging(settings: Settings) -> None:
    """Configure structlog and route stdlib logging (uvicorn, sqlalchemy, alembic) through the same pipeline."""
    level = logging.getLevelNamesMapping().get(settings.log_level.upper(), logging.INFO)

    shared: list[structlog.types.Processor] = [
        structlog.contextvars.merge_contextvars,
        structlog.stdlib.add_log_level,
        structlog.stdlib.add_logger_name,
        structlog.processors.TimeStamper(fmt="iso", utc=True),
        redact_processor,
    ]
    renderer: structlog.types.Processor = (
        structlog.processors.JSONRenderer()
        if settings.log_format is LogFormat.JSON
        else structlog.dev.ConsoleRenderer(colors=False)
    )

    structlog.configure(
        processors=[*shared, structlog.stdlib.ProcessorFormatter.wrap_for_formatter],
        logger_factory=structlog.stdlib.LoggerFactory(),
        wrapper_class=structlog.stdlib.BoundLogger,
        cache_logger_on_first_use=True,
    )

    formatter = structlog.stdlib.ProcessorFormatter(
        foreign_pre_chain=shared,
        processors=[
            structlog.stdlib.ProcessorFormatter.remove_processors_meta,
            structlog.processors.format_exc_info,
            renderer,
        ],
    )
    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(formatter)

    root = logging.getLogger()
    root.handlers = [handler]
    root.setLevel(level)
    # Access logging is done by our middleware with correlation ids; silence the duplicate uvicorn access log.
    logging.getLogger("uvicorn.access").disabled = True
    for noisy in ("uvicorn", "uvicorn.error", "sqlalchemy", "alembic"):
        logging.getLogger(noisy).handlers = []
        logging.getLogger(noisy).propagate = True
    logging.getLogger("sqlalchemy.engine").setLevel(logging.WARNING)

    structlog.get_logger(__name__).info(
        "logging_configured", level=logging.getLevelName(level), format=settings.log_format.value
    )


def get_logger(name: str) -> structlog.stdlib.BoundLogger:
    """Module logger; use keyword fields, never f-strings with user data."""
    logger: structlog.stdlib.BoundLogger = structlog.get_logger(name)
    return logger
