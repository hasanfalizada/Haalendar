"""Atom accounts.password_policy.v1 — Python implementation (contract: atoms/accounts.password_policy.v1/contract.json).

+++===+++ 2026-10-15 — Hasan Alizada — HAAL-160. Pure function; must pass atoms/accounts.password_policy.v1/vectors.json.
"""

from __future__ import annotations

import unicodedata
from functools import lru_cache
from importlib.resources import files
from typing import Literal

Violation = Literal["too_short", "too_long", "common", "contains_email", "contains_name", "low_variety"]

MIN_LENGTH = 15
MAX_LENGTH = 128
MIN_CONTEXT_WORD = 4
MIN_DISTINCT_CHARS = 5


@lru_cache(maxsize=1)
def _common_passwords() -> frozenset[str]:
    text = files("haalendar.accounts").joinpath("data/common_passwords.txt").read_text(encoding="utf-8")
    return frozenset(line for line in text.splitlines() if line and not line.startswith("#"))


def check_password(
    password: str, email: str | None = None, display_name: str | None = None
) -> list[Violation]:
    """Return violated rules in contract order (empty list = valid)."""
    normalized = unicodedata.normalize("NFKC", password)
    lowered = normalized.lower()
    violations: list[Violation] = []
    if len(normalized) < MIN_LENGTH:
        violations.append("too_short")
    if len(normalized) > MAX_LENGTH:
        violations.append("too_long")
    if lowered in _common_passwords():
        violations.append("common")
    local_part = (email or "").split("@", 1)[0].strip().lower()
    if len(local_part) >= MIN_CONTEXT_WORD and local_part in lowered:
        violations.append("contains_email")
    name_words = [
        w.lower() for w in (display_name or "").replace("-", " ").split() if len(w) >= MIN_CONTEXT_WORD
    ]
    if any(word in lowered for word in name_words):
        violations.append("contains_name")
    if len(set(normalized)) < MIN_DISTINCT_CHARS:
        violations.append("low_variety")
    return violations
