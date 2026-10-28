"""Web Push encryption and VAPID (RFC 8291, RFC 8292; D-79): the example message of RFC 8291 section 5 byte for byte,
a round trip with a browser key pair, and a JWT the push service can verify. Pure functions, no database.

+++===+++ 2026-10-28 — Hasan Alizada — HAAL-091 (stage 2).
"""

from __future__ import annotations

import json

from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.asymmetric import ec
from cryptography.hazmat.primitives.asymmetric.utils import encode_dss_signature
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from cryptography.hazmat.primitives.kdf.hkdf import HKDF

from haalendar.push.webpush import b64url, b64url_decode, encrypt, public_bytes, vapid_authorization

# RFC 8291, section 5 (example).
PLAINTEXT = b"When I grow up, I want to be a watermelon"
AS_PRIVATE = "yfWPiYE-n46HLnH0KqZOF1fJJU3MYrct3AELtAQ-oRw"
UA_PUBLIC = "BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4"
UA_PRIVATE = "q1dXpw3UpT5VOmu_cf_v6ih07Aems3njxI-JWgLcM94"
SALT = "DGv6ra1nlYgDCS1FRnbzlw"
AUTH = "BTBZMqHH6r4Tts7J_aSIgg"
EXPECTED = (
    "DGv6ra1nlYgDCS1FRnbzlwAAEABBBP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK"
    "6PBru3jl7A_yl95bQpu6cVPTpK4Mqgkf1CXztLVBSt2Ks3oZwbuwXPXLWyouBWLVWGNWQexSgSxsj_Qulcy4a-fN"
)


def _private(raw: str) -> ec.EllipticCurvePrivateKey:
    return ec.derive_private_key(int.from_bytes(b64url_decode(raw), "big"), ec.SECP256R1())


def _decrypt(body: bytes, ua_private: ec.EllipticCurvePrivateKey, auth: str) -> bytes:
    """What the browser does (RFC 8291 section 3), written separately from encrypt()."""
    salt, idlen = body[:16], body[20]
    sender_bytes, record = body[21 : 21 + idlen], body[21 + idlen :]
    sender = ec.EllipticCurvePublicKey.from_encoded_point(ec.SECP256R1(), sender_bytes)
    receiver_bytes = public_bytes(ua_private.public_key())
    shared = ua_private.exchange(ec.ECDH(), sender)

    def hkdf(salt_: bytes, info: bytes, length: int, material: bytes) -> bytes:
        return HKDF(algorithm=hashes.SHA256(), length=length, salt=salt_, info=info).derive(material)

    ikm = hkdf(b64url_decode(auth), b"WebPush: info\x00" + receiver_bytes + sender_bytes, 32, shared)
    key = hkdf(salt, b"Content-Encoding: aes128gcm\x00", 16, ikm)
    nonce = hkdf(salt, b"Content-Encoding: nonce\x00", 12, ikm)
    plain = AESGCM(key).decrypt(nonce, record, None)
    assert plain.endswith(b"\x02")
    return plain[:-1]


def test_the_example_of_rfc_8291() -> None:
    body = encrypt(PLAINTEXT, UA_PUBLIC, AUTH, sender_key=_private(AS_PRIVATE), salt=b64url_decode(SALT))
    assert b64url(body) == EXPECTED
    assert _decrypt(body, _private(UA_PRIVATE), AUTH) == PLAINTEXT


def test_a_round_trip_with_a_fresh_browser_key() -> None:
    browser = ec.generate_private_key(ec.SECP256R1())
    auth = b64url(b"0123456789abcdef")
    message = json.dumps({"title": "Dentist", "body": "Today, 11:00\u201312:00"}).encode()
    first = encrypt(message, b64url(public_bytes(browser.public_key())), auth)
    second = encrypt(message, b64url(public_bytes(browser.public_key())), auth)
    assert first != second  # a fresh sender key and salt every time
    assert _decrypt(first, browser, auth) == message


def test_the_vapid_token_verifies_with_our_public_key() -> None:
    server = ec.generate_private_key(ec.SECP256R1())
    header = vapid_authorization(
        "https://fcm.googleapis.com/fcm/send/abc", server, "mailto:admin@example.org", now=1_800_000_000
    )
    assert header.startswith("vapid t=")
    token, key = header[len("vapid t=") :].split(", k=")
    assert b64url_decode(key) == public_bytes(server.public_key())
    head, claims, signature = token.split(".")
    assert json.loads(b64url_decode(head)) == {"typ": "JWT", "alg": "ES256"}
    assert json.loads(b64url_decode(claims)) == {
        "aud": "https://fcm.googleapis.com",
        "exp": 1_800_000_000 + 12 * 3600,
        "sub": "mailto:admin@example.org",
    }
    raw = b64url_decode(signature)
    der = encode_dss_signature(int.from_bytes(raw[:32], "big"), int.from_bytes(raw[32:], "big"))
    public = ec.EllipticCurvePublicKey.from_encoded_point(ec.SECP256R1(), b64url_decode(key))
    public.verify(der, f"{head}.{claims}".encode(), ec.ECDSA(hashes.SHA256()))  # raises when wrong
