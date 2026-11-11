"""Password hashing (Argon2id) and opaque token helpers.

+++===+++ 2026-10-15 — Hasan Alizada — HAAL-160. Argon2id with argon2-cffi defaults (RFC 9106 low-memory profile),
parameters embedded in the hash and transparently upgraded on login. Tokens are 256-bit random values; only their
SHA-256 hex digest is stored (a database leak does not reveal usable sessions or links). ASVS 5.0 V6, V7, V11.
"""

from __future__ import annotations

import base64
import hashlib
import hmac
import os
import secrets

from argon2 import PasswordHasher
from argon2.exceptions import InvalidHashError, VerificationError, VerifyMismatchError
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from cryptography.hazmat.primitives.kdf.hkdf import HKDF

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


# +++===+++ 2026-10-15 — Hasan Alizada — HAAL-162. Encryption of TOTP secrets at rest: AES-256-GCM with a key derived
# from HAALENDAR_SECRET_KEY via HKDF-SHA256 (purpose-bound). Stored as "v1:<base64(nonce|ciphertext)>"; the version
# prefix allows key rotation later. Recovery codes: 10 random codes, shown once, stored as SHA-256.

_TOTP_KEY_INFO = b"haalendar/totp-secret/v1"
RECOVERY_CODE_COUNT = 10


def _totp_key(secret_key: str) -> bytes:
    return HKDF(algorithm=hashes.SHA256(), length=32, salt=None, info=_TOTP_KEY_INFO).derive(
        secret_key.encode()
    )


def encrypt_secret(plaintext: str, secret_key: str) -> str:
    nonce = os.urandom(12)
    ciphertext = AESGCM(_totp_key(secret_key)).encrypt(nonce, plaintext.encode("utf-8"), _TOTP_KEY_INFO)
    return "v1:" + base64.urlsafe_b64encode(nonce + ciphertext).decode("ascii")


def decrypt_secret(stored: str, secret_key: str) -> str:
    version, _, payload = stored.partition(":")
    if version != "v1":
        raise ValueError("Unsupported secret format")
    raw = base64.urlsafe_b64decode(payload)
    return AESGCM(_totp_key(secret_key)).decrypt(raw[:12], raw[12:], _TOTP_KEY_INFO).decode("utf-8")


def new_recovery_codes() -> list[str]:
    """Codes like "k7m2-q9xf-3wpa" (lower-case base32 alphabet without ambiguous characters)."""
    alphabet = "abcdefghjkmnpqrstuvwxyz23456789"
    codes = []
    for _ in range(RECOVERY_CODE_COUNT):
        raw = "".join(secrets.choice(alphabet) for _ in range(12))
        codes.append(f"{raw[:4]}-{raw[4:8]}-{raw[8:]}")
    return codes


def normalize_recovery_code(code: str) -> str:
    compact = code.strip().lower().replace("-", "").replace(" ", "")
    return f"{compact[:4]}-{compact[4:8]}-{compact[8:]}" if len(compact) == 12 else compact
