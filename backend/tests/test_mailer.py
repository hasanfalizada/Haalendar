"""Mailer selection and SMTP behaviour (STARTTLS, SSL, authentication, failures) with a fake SMTP class.

+++===+++ 2026-10-15 — Hasan Alizada — HAAL-161.
"""

from __future__ import annotations

import asyncio
import smtplib
from email.message import EmailMessage
from pathlib import Path
from typing import Any, ClassVar

import pytest
from pydantic import ValidationError

from haalendar.accounts.mailer import DisabledMailer, FileMailer, SmtpMailer, create_mailer

from .conftest import make_settings


class FakeSMTP:
    instances: ClassVar[list[FakeSMTP]] = []
    fail_with: ClassVar[Exception | None] = None

    def __init__(self, host: str, port: int, timeout: float, **kwargs: Any) -> None:
        self.host, self.port, self.timeout = host, port, timeout
        self.calls: list[str] = []
        self.message: EmailMessage | None = None
        FakeSMTP.instances.append(self)

    def __enter__(self) -> FakeSMTP:
        return self

    def __exit__(self, *args: object) -> None:
        self.calls.append("quit")

    def starttls(self, context: object) -> None:
        self.calls.append("starttls")

    def login(self, user: str, password: str) -> None:
        self.calls.append(f"login:{user}")

    def send_message(self, message: EmailMessage) -> None:
        if FakeSMTP.fail_with:
            raise FakeSMTP.fail_with
        self.calls.append("send")
        self.message = message


@pytest.fixture(autouse=True)
def fake_smtp(monkeypatch: pytest.MonkeyPatch) -> None:
    FakeSMTP.instances = []
    FakeSMTP.fail_with = None
    monkeypatch.setattr(smtplib, "SMTP", FakeSMTP)
    monkeypatch.setattr(smtplib, "SMTP_SSL", FakeSMTP)


def test_mailer_selection() -> None:
    assert isinstance(create_mailer(make_settings(smtp_host="smtp.example.org")), SmtpMailer)
    assert isinstance(create_mailer(make_settings()), FileMailer)
    production = make_settings(env="production", secret_key="k" * 40, public_url="https://cal.example.org")
    assert isinstance(create_mailer(production), DisabledMailer)


def test_credentials_over_plaintext_smtp_are_refused() -> None:
    with pytest.raises(ValidationError, match="SMTP_SECURITY"):
        make_settings(smtp_host="smtp.example.org", smtp_username="u", smtp_security="none")
    assert make_settings(smtp_host="relay.local", smtp_security="none").smtp_security == "none"


def test_starttls_with_login() -> None:
    settings = make_settings(
        smtp_host="smtp.example.org", smtp_port="587", smtp_username="mailer", smtp_password="secret-value"
    )
    assert asyncio.run(SmtpMailer(settings).send("a@example.org", "Subject", "Body")) is True
    smtp = FakeSMTP.instances[0]
    assert (smtp.host, smtp.port) == ("smtp.example.org", 587)
    assert smtp.calls == ["starttls", "login:mailer", "send", "quit"]
    assert smtp.message is not None and smtp.message["To"] == "a@example.org"


def test_ssl_without_login() -> None:
    settings = make_settings(smtp_host="smtp.example.org", smtp_port="465", smtp_security="ssl")
    assert asyncio.run(SmtpMailer(settings).send("a@example.org", "S", "B")) is True
    assert FakeSMTP.instances[0].calls == ["send", "quit"]


def test_failure_is_reported_not_raised(caplog: pytest.LogCaptureFixture) -> None:
    FakeSMTP.fail_with = smtplib.SMTPRecipientsRefused({"a@example.org": (550, b"no")})
    settings = make_settings(smtp_host="smtp.example.org", smtp_password="secret-value", smtp_username="u")
    assert asyncio.run(SmtpMailer(settings).send("a@example.org", "S", "B")) is False
    assert "mail_send_failed" in caplog.text
    assert "secret-value" not in caplog.text


def test_file_mailer_writes_eml(tmp_path: Path) -> None:
    mailer = FileMailer(make_settings(mail_dir=str(tmp_path)))
    assert asyncio.run(mailer.send("a@example.org", "Hello", "Link: https://x/?token=abc")) is True
    files = list(tmp_path.glob("*.eml"))
    assert len(files) == 1 and b"token=abc" in files[0].read_bytes()
