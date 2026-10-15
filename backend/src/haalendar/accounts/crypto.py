"""Password hashing (Argon2id) and opaque token helpers.

+++===+++ 2026-10-15 — Hasan Alizada — HAAL-160. Argon2id with argon2-cffi defaults (RFC 9106 low-memory profile),
parameters embedded in the hash and transparently upgraded on login. Tokens are 256-bit random values; only their
SHA-256 hex digest is stored (a database leak does not reveal usable sessions or links). ASVS 5.0 V6, V7, V11.
"""

from __future__ import annotations

import hashlib
import hmac
import secrets

from argon2 import PasswordHasher
from argon2.exceptions import InvalidHashError, VerificationError, VerifyMismatchError

_hasher = PasswordHasher()
# Verified when the e-mail is unknown, so that response time does not reveal whether an account exists.
_DUMMY_HASH = _hasher.hash("dummy-password-for-timing-equalisation")


def hash_password(password: str) -> str:
    return _hasher.hash(password)


def verify_password(stored_hash: str, password: str) -> bool:
    try:
        return _hasher.verify(stored_hash, password)
    except VerifyMismatchError, VerificationError, InvalidHashError:
        return False


def needs_rehash(stored_hash: str) -> bool:
    return _hasher.check_needs_rehash(stored_hash)


def burn_verification_time(password: str) -> None:
    verify_password(_DUMMY_HASH, password)


def new_token() -> str:
    """URL-safe 256-bit random token for cookies and e-mail links."""
    return secrets.token_urlsafe(32)


def token_digest(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def constant_time_equals(left: str, right: str) -> bool:
    return hmac.compare_digest(left.encode("utf-8"), right.encode("utf-8"))
