"""Pure logic of login protection: lock schedule, secret encryption, recovery codes.

+++===+++ 2026-10-15 — Hasan Alizada — HAAL-162.
"""

from __future__ import annotations

from datetime import timedelta

import pytest
from cryptography.exceptions import InvalidTag

from haalendar.accounts import crypto
from haalendar.accounts.service import lock_duration


@pytest.mark.parametrize(
    ("failures", "expected"),
    [
        (4, None),
        (5, timedelta(minutes=15)),
        (6, None),
        (10, timedelta(minutes=30)),
        (15, timedelta(hours=1)),
        (20, timedelta(hours=2)),
        (45, timedelta(hours=24)),  # 15 min * 2^8 = 64 h, capped
    ],
)
def test_lock_schedule_doubles_and_is_capped(failures: int, expected: timedelta | None) -> None:
    assert lock_duration(failures) == expected


def test_secret_encryption_round_trip_and_key_binding() -> None:
    stored = crypto.encrypt_secret("JBSWY3DPEHPK3PXP", "k" * 40)
    assert stored.startswith("v1:") and "JBSWY3DPEHPK3PXP" not in stored
    assert crypto.encrypt_secret("JBSWY3DPEHPK3PXP", "k" * 40) != stored  # random nonce
    assert crypto.decrypt_secret(stored, "k" * 40) == "JBSWY3DPEHPK3PXP"
    with pytest.raises(InvalidTag):
        crypto.decrypt_secret(stored, "x" * 40)


def test_recovery_codes_format_and_normalization() -> None:
    codes = crypto.new_recovery_codes()
    assert len(codes) == 10 and len(set(codes)) == 10
    for code in codes:
        assert len(code) == 14 and code.count("-") == 2
        assert not set(code.replace("-", "")) & set("01ilo")  # no ambiguous characters
    assert crypto.normalize_recovery_code(" K7M2 Q9XF 3WPA ") == "k7m2-q9xf-3wpa"
