"""Outgoing e-mail: SMTP in real deployments, .eml files in development/test, nothing otherwise.

+++===+++ 2026-10-15 — Hasan Alizada — HAAL-160. Mail bodies contain one-time links; they are written only to the
recipient (or to the developer's mail directory), never to logs. Sending runs in a worker thread with a timeout; it
moves to the background job queue (Procrastinate) together with reminders (HAAL-091).
"""

from __future__ import annotations

import asyncio
import smtplib
import ssl
import tempfile
import time
import uuid
from email.message import EmailMessage
from pathlib import Path
from typing import Protocol

from haalendar.config import Environment, Settings
from haalendar.logging import get_logger

log = get_logger(__name__)

SMTP_TIMEOUT_SECONDS = 10


class Mailer(Protocol):
    async def send(self, to: str, subject: str, body: str) -> bool: ...


def _message(sender: str, to: str, subject: str, body: str) -> EmailMessage:
    message = EmailMessage()
    message["From"] = sender
    message["To"] = to
    message["Subject"] = subject
    message["Message-ID"] = f"<{uuid.uuid4().hex}@haalendar>"
    message.set_content(body)
    return message


class SmtpMailer:
    def __init__(self, settings: Settings) -> None:
        self.settings = settings

    def _send_sync(self, message: EmailMessage) -> None:
        s = self.settings
        context = ssl.create_default_context()
        smtp: smtplib.SMTP
        if s.smtp_security == "ssl":
            smtp = smtplib.SMTP_SSL(s.smtp_host, s.smtp_port, timeout=SMTP_TIMEOUT_SECONDS, context=context)
        else:
            smtp = smtplib.SMTP(s.smtp_host, s.smtp_port, timeout=SMTP_TIMEOUT_SECONDS)
        with smtp:
            if s.smtp_security == "starttls":
                smtp.starttls(context=context)
            if s.smtp_username and s.smtp_password is not None:
                smtp.login(s.smtp_username, s.smtp_password.get_secret_value())
            smtp.send_message(message)

    async def send(self, to: str, subject: str, body: str) -> bool:
        started = time.perf_counter()
        try:
            await asyncio.to_thread(self._send_sync, _message(self.settings.mail_from, to, subject, body))
        except (OSError, smtplib.SMTPException) as exc:
            log.error("mail_send_failed", error_type=type(exc).__name__, subject=subject)
            return False
        log.info("mail_sent", subject=subject, duration_ms=round((time.perf_counter() - started) * 1000, 1))
        return True


class FileMailer:
    """Development/test: each message becomes an .eml file the developer can open."""

    def __init__(self, settings: Settings) -> None:
        self.directory = Path(settings.mail_dir or Path(tempfile.gettempdir()) / "haalendar-mail")
        self.sender = settings.mail_from

    async def send(self, to: str, subject: str, body: str) -> bool:
        self.directory.mkdir(parents=True, exist_ok=True)
        # Nanosecond prefix: file names sort in sending order even within the same second.
        path = self.directory / f"{time.time_ns():020d}-{uuid.uuid4().hex[:8]}.eml"
        path.write_bytes(_message(self.sender, to, subject, body).as_bytes())
        log.info("mail_written_to_file", subject=subject, file=path.name)
        return True


class DisabledMailer:
    """Production without SMTP: nothing is sent; admins handle verification and resets (HAAL-161/164)."""

    async def send(self, to: str, subject: str, body: str) -> bool:
        log.warning("mail_not_sent_no_smtp", subject=subject)
        return False


def create_mailer(settings: Settings) -> Mailer:
    if settings.smtp_host:
        return SmtpMailer(settings)
    if settings.env in (Environment.DEVELOPMENT, Environment.TEST):
        return FileMailer(settings)
    return DisabledMailer()
