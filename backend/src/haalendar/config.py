"""Application settings (Twelve-Factor: everything from environment variables).

+++===+++ 2026-10-14 — Hasan Alizada — HAAL-016. Settings with HAALENDAR_ prefix; every secret can also be given
as HAALENDAR_<NAME>_FILE pointing to a Docker secret file (ADR-0004 section 6). Production refuses insecure defaults.
"""

from __future__ import annotations

import os
from enum import StrEnum
from functools import lru_cache
from pathlib import Path
from typing import Any

from pydantic import Field, SecretStr, model_validator
from pydantic_settings import BaseSettings, PydanticBaseSettingsSource, SettingsConfigDict

ENV_PREFIX = "HAALENDAR_"

# Placeholder used only outside production; production startup fails if it is still set.
DEV_SECRET_KEY = "dev-insecure-secret-key-change-me-0000000000000000"  # noqa: S105 — dev placeholder, rejected in production


class Environment(StrEnum):
    DEVELOPMENT = "development"
    TEST = "test"
    PRODUCTION = "production"


class LogFormat(StrEnum):
    JSON = "json"
    CONSOLE = "console"


def _read_secret_files(environ: dict[str, str]) -> dict[str, str]:
    """Resolve HAALENDAR_<NAME>_FILE variables into HAALENDAR_<NAME> values.

    A direct value wins over the _FILE variant so that tests and local overrides stay simple.
    Only the file path is ever logged, never its content.
    """
    resolved: dict[str, str] = {}
    for key, path in environ.items():
        if not (key.startswith(ENV_PREFIX) and key.endswith("_FILE")):
            continue
        target = key[: -len("_FILE")]
        if target in environ:
            continue
        resolved[target] = Path(path).read_text(encoding="utf-8").strip()
    return resolved


class Settings(BaseSettings):
    """Typed runtime configuration. Field names map to HAALENDAR_<UPPER_NAME>."""

    model_config = SettingsConfigDict(env_prefix=ENV_PREFIX, extra="ignore", frozen=True)

    env: Environment = Environment.DEVELOPMENT
    database_url: SecretStr = SecretStr("postgresql+psycopg://haalendar:haalendar@localhost:5432/haalendar")
    db_pool_size: int = Field(default=5, ge=1, le=100)
    db_max_overflow: int = Field(default=5, ge=0, le=100)
    db_pool_timeout_seconds: float = Field(default=5.0, gt=0)
    db_connect_timeout_seconds: int = Field(default=5, ge=1, le=60)
    secret_key: SecretStr = SecretStr(DEV_SECRET_KEY)
    public_url: str = "http://localhost:8080"
    # Inside the container the API must listen on all interfaces; the port is published by Compose.
    bind_host: str = "0.0.0.0"  # noqa: S104
    port: int = Field(default=8080, ge=1, le=65535)
    # Reverse proxies (Caddy profile or operator proxy) allowed to set X-Forwarded-* headers.
    forwarded_allow_ips: str = "127.0.0.1"
    log_level: str = "INFO"
    log_format: LogFormat = LogFormat.JSON
    demo_mode: bool = False
    # HSTS is only meaningful behind HTTPS; enabled automatically when public_url uses https.
    hsts_max_age_seconds: int = Field(default=31_536_000, ge=0)
    # Observability (HAAL-019): /metrics is off by default; when on, it requires this bearer token.
    metrics_enabled: bool = False
    metrics_token: SecretStr | None = None
    # SQL statements slower than this are logged (0 disables); default matches the p95 API target (SRS 4.1).
    db_slow_query_ms: int = Field(default=200, ge=0)

    @model_validator(mode="after")
    def _forbid_insecure_production(self) -> Settings:
        """Fail fast instead of running production with development defaults (Security first)."""
        if self.metrics_enabled and (
            self.metrics_token is None or len(self.metrics_token.get_secret_value()) < 24
        ):
            raise ValueError(
                "HAALENDAR_METRICS_TOKEN (at least 24 characters) is required when metrics are enabled"
            )
        if self.env is Environment.PRODUCTION:
            secret = self.secret_key.get_secret_value()
            if secret == DEV_SECRET_KEY or len(secret) < 32:
                raise ValueError(
                    "HAALENDAR_SECRET_KEY must be set to a random value of at least 32 characters"
                )
            if not self.public_url.startswith("https://"):
                raise ValueError("HAALENDAR_PUBLIC_URL must use https:// in production")
        return self

    @property
    def https(self) -> bool:
        return self.public_url.startswith("https://")


class _ExplicitSettings(Settings):
    """Settings that read only constructor values — used when an explicit environment mapping is given."""

    @classmethod
    def settings_customise_sources(
        cls,
        settings_cls: type[BaseSettings],
        init_settings: PydanticBaseSettingsSource,
        env_settings: PydanticBaseSettingsSource,
        dotenv_settings: PydanticBaseSettingsSource,
        file_secret_settings: PydanticBaseSettingsSource,
    ) -> tuple[PydanticBaseSettingsSource, ...]:
        return (init_settings,)


def load_settings(environ: dict[str, str] | None = None) -> Settings:
    """Build settings from the given environment (default: process environment) incl. *_FILE secrets."""
    source = dict(os.environ if environ is None else environ)
    overrides: dict[str, Any] = {}
    for key, value in _read_secret_files(source).items():
        overrides[key[len(ENV_PREFIX) :].lower()] = value
    if environ is None:
        return Settings(**overrides)
    # Explicit environment (tests, tools): os.environ is not consulted at all.
    explicit = {k[len(ENV_PREFIX) :].lower(): v for k, v in source.items() if k.startswith(ENV_PREFIX)}
    explicit = {k: v for k, v in explicit.items() if not k.endswith("_file")}
    return _ExplicitSettings(**{**explicit, **overrides})


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    """Process-wide settings singleton (FastAPI dependency)."""
    return load_settings()
