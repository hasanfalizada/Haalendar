"""The public demo (FR-OPS-03, D-103): what is the same for the API, the guard and the reset.

+++===+++ 2026-11-09 — Hasan Alizada — HAAL-154. Two regular accounts with a published password, a reset at every full
and half hour UTC (the time of the next one follows from the clock, so nothing is stored), stricter upload limits and
the operations a visitor could use to lock the others out or to make the stand send something.
"""

from __future__ import annotations

import re
import uuid
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta

RESET_MINUTES = 30
# Public on purpose: the sign-in page shows it. The accounts hold made-up data and no administrator exists.
PASSWORD = "calm-otter-paints-demo-26"  # noqa: S105  # gitleaks:allow
MAX_UPLOAD_BYTES = 1024 * 1024
# Per account: everything is removed again at the next reset.
MAX_ACCOUNT_FILES_BYTES = 100 * 1024 * 1024
REFUSAL = "This is not available in the demo"


@dataclass(frozen=True, slots=True)
class Account:
    # Fixed id: a browser keeps one local database per user, and it stays the same one after a reset.
    id: uuid.UUID
    email: str
    display_name: str


MIRA = Account(uuid.UUID("0193f000-0000-7000-8000-000000000001"), "mira@example.org", "Mira Novak")
ALEX = Account(uuid.UUID("0193f000-0000-7000-8000-000000000002"), "alex@example.org", "Alex Stone")
ACCOUNTS = (MIRA, ALEX)

_ID = "[^/]+"
# Each of these would let one visitor lock the others out, or make the stand send mail or push messages.
REFUSED: tuple[tuple[str, re.Pattern[str]], ...] = tuple(
    (method, re.compile(f"^/api/v1{path}$"))
    for method, path in (
        ("POST", "/setup/admin"),
        ("POST", "/auth/register"),
        ("POST", "/auth/verify-email"),
        ("POST", "/auth/verify-email/resend"),
        ("POST", "/auth/password-reset/request"),
        ("POST", "/auth/password-reset/confirm"),
        ("POST", "/auth/password-reset/info"),
        ("POST", "/auth/invite-info"),
        ("POST", "/me/password"),
        ("POST", "/me/totp/setup"),
        ("POST", "/me/totp/enable"),
        ("POST", "/me/totp/disable"),
        ("POST", "/me/totp/recovery-codes"),
        ("DELETE", f"/me/sessions/{_ID}"),
        ("POST", "/me/sessions/revoke-others"),
        ("POST", "/me/push-subscriptions"),
        ("POST", "/exports"),
    )
)


def is_refused(method: str, path: str) -> bool:
    return any(method == refused and pattern.match(path) for refused, pattern in REFUSED)


def next_reset_at(now: datetime) -> datetime:
    """The next full or half hour, strictly after `now`."""
    current = now.astimezone(UTC).replace(second=0, microsecond=0)
    return current + timedelta(minutes=RESET_MINUTES - current.minute % RESET_MINUTES)
