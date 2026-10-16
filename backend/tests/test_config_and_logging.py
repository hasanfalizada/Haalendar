"""Settings loading, production safety checks and log redaction.

+++===+++ 2026-10-14 — Hasan Alizada — HAAL-016.
"""

from __future__ import annotations

import shutil
import subprocess
from pathlib import Path

import pytest
from pydantic import ValidationError

from haalendar.accounts.service import setup_token_required
from haalendar.config import DEV_SECRET_KEY, Environment, Settings, load_settings
from haalendar.logging import REDACTED, redact_processor


def test_defaults_are_development() -> None:
    settings = load_settings({})
    assert settings.env is Environment.DEVELOPMENT
    assert settings.port == 8080
    assert settings.https is False


def test_explicit_environment_ignores_process_environment(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("HAALENDAR_PORT", "9999")
    assert load_settings({}).port == 8080


# +++===+++ 2026-10-16 — Hasan Alizada — HAAL-036. Empty values are "not set" (.env.example ships empty values).
def test_empty_values_mean_not_set(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
    explicit = load_settings(
        {"HAALENDAR_SETUP_TOKEN": "", "HAALENDAR_SECRET_KEY": "  ", "HAALENDAR_PORT": ""}
    )
    assert explicit.setup_token is None and not setup_token_required(explicit)
    assert explicit.secret_key.get_secret_value() == DEV_SECRET_KEY and explicit.port == 8080

    monkeypatch.setenv("HAALENDAR_SETUP_TOKEN", "")
    assert Settings().setup_token is None

    empty_file = tmp_path / "token"
    empty_file.write_text("\n", encoding="utf-8")
    assert load_settings({"HAALENDAR_SETUP_TOKEN_FILE": str(empty_file)}).setup_token is None
    configured = load_settings({"HAALENDAR_SETUP_TOKEN": "t" * 24})
    assert setup_token_required(configured)


def test_env_example_can_be_sourced_and_loaded() -> None:
    example = Path(__file__).resolve().parents[2] / ".env.example"
    script = 'set -a; source "$1"; set +a; printf "%s|%s" "$HAALENDAR_MAIL_FROM" "$HAALENDAR_DEMO_MODE"'
    bash = shutil.which("bash")
    assert bash is not None
    # Fixed script and the repository's own file — no untrusted input.
    done = subprocess.run(  # noqa: S603
        [bash, "-c", script, "bash", str(example)], capture_output=True, text=True, check=False
    )
    assert done.returncode == 0 and done.stderr == "", done.stderr
    assert done.stdout == "Haalendar <no-reply@localhost>|false"  # the last line was reached

    values: dict[str, str] = {}
    for line in example.read_text(encoding="utf-8").splitlines():
        if line and not line.startswith("#"):
            key, _, value = line.partition("=")
            values[key] = value.strip('"')
    settings = load_settings(values)
    assert settings.env is Environment.DEVELOPMENT and not setup_token_required(settings)


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
            "HAALENDAR_DATABASE_URL": "postgresql+psycopg://haalendar_app:s3cret@db/haalendar",
            "HAALENDAR_STORAGE_DIR": "/data/storage",
        }
    )
    assert settings.https is True
    assert settings.secret_key.get_secret_value() != DEV_SECRET_KEY


def test_production_requires_an_explicit_database_url() -> None:
    # +++===+++ 2026-10-15 — Hasan Alizada — HAAL-165. The development application-role URL is refused in production.
    with pytest.raises(ValueError, match="HAALENDAR_DATABASE_URL"):
        load_settings(
            {
                "HAALENDAR_ENV": "production",
                "HAALENDAR_SECRET_KEY": "x" * 40,
                "HAALENDAR_PUBLIC_URL": "https://cal.example.org",
            }
        )


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
