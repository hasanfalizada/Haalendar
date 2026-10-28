"""Web Push (FR-CAL-29, owner decision D-79): message encryption (RFC 8291, aes128gcm) and VAPID (RFC 8292) on
`cryptography` only — the common libraries are MPL-2.0, outside the licence policy (ADR-0003).

+++===+++ 2026-10-28 — Hasan Alizada — HAAL-091 (stage 2).
- encrypt(): a fresh sender key pair and salt per message; ECDH with the browser's key (p256dh), HKDF with its auth
  secret, one record (payload + 0x02, no padding) with the aes128gcm header. The test reproduces RFC 8291 section 5.
- vapid_authorization(): an ES256 JWT for the push service's origin (12 hours) and our public key.
- send(): one POST to the subscription's endpoint (stdlib HTTP, run in a thread); the status tells whether the
  subscription is gone (404 / 410).
"""

from __future__ import annotations

import asyncio
import base64
import json
import os
import time
import urllib.error
import urllib.request
from dataclasses import dataclass
from urllib.parse import urlsplit

from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import ec
from cryptography.hazmat.primitives.asymmetric.utils import decode_dss_signature
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from cryptography.hazmat.primitives.kdf.hkdf import HKDF

RECORD_SIZE = 4096
JWT_LIFETIME_SECONDS = 12 * 3600
TIMEOUT_SECONDS = 10


def b64url(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode("ascii")


def b64url_decode(text: str) -> bytes:
    return base64.urlsafe_b64decode(text + "=" * (-len(text) % 4))


def public_bytes(key: ec.EllipticCurvePublicKey) -> bytes:
    return key.public_bytes(serialization.Encoding.X962, serialization.PublicFormat.UncompressedPoint)


def _hkdf(salt: bytes, info: bytes, length: int, material: bytes) -> bytes:
    return HKDF(algorithm=hashes.SHA256(), length=length, salt=salt, info=info).derive(material)


def encrypt(
    payload: bytes,
    p256dh: str,
    auth: str,
    *,
    sender_key: ec.EllipticCurvePrivateKey | None = None,
    salt: bytes | None = None,
) -> bytes:
    """The aes128gcm body of a push message (RFC 8291); key and salt are given only by tests."""
    receiver_bytes = b64url_decode(p256dh)
    receiver = ec.EllipticCurvePublicKey.from_encoded_point(ec.SECP256R1(), receiver_bytes)
    sender = sender_key or ec.generate_private_key(ec.SECP256R1())
    sender_bytes = public_bytes(sender.public_key())
    salt = salt or os.urandom(16)
    shared = sender.exchange(ec.ECDH(), receiver)
    ikm = _hkdf(b64url_decode(auth), b"WebPush: info\x00" + receiver_bytes + sender_bytes, 32, shared)
    key = _hkdf(salt, b"Content-Encoding: aes128gcm\x00", 16, ikm)
    nonce = _hkdf(salt, b"Content-Encoding: nonce\x00", 12, ikm)
    record = AESGCM(key).encrypt(nonce, payload + b"\x02", None)
    header = salt + RECORD_SIZE.to_bytes(4, "big") + bytes([len(sender_bytes)]) + sender_bytes
    return header + record


def vapid_authorization(
    endpoint: str, private_key: ec.EllipticCurvePrivateKey, subject: str, now: float | None = None
) -> str:
    """`Authorization` header value for a push to `endpoint` (RFC 8292)."""
    parts = urlsplit(endpoint)
    claims = {
        "aud": f"{parts.scheme}://{parts.netloc}",
        "exp": int((now or time.time()) + JWT_LIFETIME_SECONDS),
        "sub": subject,
    }
    signing_input = (
        b64url(json.dumps({"typ": "JWT", "alg": "ES256"}, separators=(",", ":")).encode())
        + "."
        + b64url(json.dumps(claims, separators=(",", ":")).encode())
    )
    r, s = decode_dss_signature(private_key.sign(signing_input.encode("ascii"), ec.ECDSA(hashes.SHA256())))
    signature = r.to_bytes(32, "big") + s.to_bytes(32, "big")
    token = f"{signing_input}.{b64url(signature)}"
    return f"vapid t={token}, k={b64url(public_bytes(private_key.public_key()))}"


@dataclass(frozen=True, slots=True)
class Delivery:
    status: int

    @property
    def gone(self) -> bool:
        """The browser dropped the subscription: it is revoked here too."""
        return self.status in (404, 410)

    @property
    def ok(self) -> bool:
        return 200 <= self.status < 300


def _post(endpoint: str, body: bytes, headers: dict[str, str]) -> int:
    request = urllib.request.Request(endpoint, data=body, headers=headers, method="POST")  # noqa: S310 — https push service URLs from the browser
    try:
        with urllib.request.urlopen(request, timeout=TIMEOUT_SECONDS) as response:  # noqa: S310
            return int(response.status)
    except urllib.error.HTTPError as error:
        return int(error.code)
    except urllib.error.URLError, TimeoutError, OSError:
        return 0


async def send(
    endpoint: str,
    p256dh: str,
    auth: str,
    message: dict[str, object],
    private_key: ec.EllipticCurvePrivateKey,
    subject: str,
    ttl_seconds: int = 3600,
) -> Delivery:
    """Encrypts `message` (JSON) and posts it; status 0 means the push service could not be reached."""
    body = encrypt(json.dumps(message, separators=(",", ":")).encode("utf-8"), p256dh, auth)
    headers = {
        "Authorization": vapid_authorization(endpoint, private_key, subject),
        "Content-Encoding": "aes128gcm",
        "Content-Type": "application/octet-stream",
        "TTL": str(ttl_seconds),
        "Urgency": "high",
    }
    return Delivery(status=await asyncio.to_thread(_post, endpoint, body, headers))
