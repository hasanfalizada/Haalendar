"""Settings loading, production safety checks and log redaction.

+++===+++ 2026-10-14 — Hasan Alizada — HAAL-016.
"""

from __future__ import annotations

from pathlib import Path

import pytest
from pydantic import ValidationError

from haalendar.config import DEV_SECRET_KEY, Environment, load_settings
from haalendar.logging import REDACTED, redact_processor


def test_defaults_are_development() -> None:
    settings = load_settings({})
    assert settings.env is Environment.DEVELOPMENT
    assert settings.port == 8080
    assert settings.https is False


def test_explicit_environment_ignores_process_environment(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("HAALENDAR_PORT", "9999")
    assert load_settings({}).port == 8080


def test_secret_can_be_read_from_file(tmp_path: Path) -> None:
    secret_file = tmp_path / "secret_key"
    secret_file.write_text("s" * 40 + "\n", encoding="utf-8")
    settings = load_settings({"HAALENDAR_SECRET_KEY_FILE": str(secret_file)})
    assert settings.secret_key.get_secret_value() == "s" * 40


def test_direct_value_wins_over_file(tmp_path: Path) -> None:
    secret_file = tmp_path / "secret_key"
    secret_file.write_text("from-file", encoding="utf-8")
    settings = load_settings(
        {"HAALENDAR_SECRET_KEY": "direct", "HAALENDAR_SECRET_KEY_FILE": str(secret_file)}
    )
    assert settings.secret_key.get_secret_value() == "direct"


def test_production_rejects_default_secret() -> None:
    with pytest.raises(ValidationError, match="SECRET_KEY"):
        load_settings({"HAALENDAR_ENV": "production", "HAALENDAR_PUBLIC_URL": "https://cal.example.org"})


def test_production_rejects_plain_http() -> None:
    with pytest.raises(ValidationError, match="https"):
        load_settings({"HAALENDAR_ENV": "production", "HAALENDAR_SECRET_KEY": "x" * 40})


def test_production_accepts_safe_configuration() -> None:
    settings = load_settings(
        {
            "HAALENDAR_ENV": "production",
            "HAALENDAR_SECRET_KEY": "x" * 40,
            "HAALENDAR_PUBLIC_URL": "https://cal.example.org",
        }
    )
    assert settings.https is True
    assert settings.secret_key.get_secret_value() != DEV_SECRET_KEY


def test_secrets_are_hidden_in_repr() -> None:
    settings = load_settings({"HAALENDAR_DATABASE_URL": "postgresql+psycopg://u:topsecret@db/x"})
    assert "topsecret" not in repr(settings)


def test_redaction_of_sensitive_keys_including_nested() -> None:
    event = {
        "event": "login_attempt",
        "email": "a@example.org",
        "password": "hunter2",
        "headers": {"Authorization": "Bearer abc", "Accept": "json"},
        "items": [{"csrf_token": "t"}, {"ok": 1}],
    }
    result = redact_processor(None, "info", event)
    assert result["password"] == REDACTED
    assert result["headers"] == {"Authorization": REDACTED, "Accept": "json"}
    assert result["items"] == [{"csrf_token": REDACTED}, {"ok": 1}]
    assert result["email"] == "a@example.org"
    assert result["event"] == "login_attempt"
