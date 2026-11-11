"""Web Push service (FR-CAL-29, owner decision D-79): the instance's VAPID keys, the users' browser subscriptions and
delivering a message to all browsers of a user.

+++===+++ 2026-10-28 — Hasan Alizada — HAAL-091 (stage 2).
- Keys: made on first use (API or worker, whichever comes first; a concurrent second one loses the insert and reads
  the first), the private key encrypted with the secret key.
- Subscribe: the endpoint is taken over from other users of the same browser (haalendar_push_claim); the user's own
  active subscription of that endpoint is refreshed (the browser may renew its keys), otherwise a new one is made.
  Production accepts only https endpoints of the known push services (SSRF guard, Settings.push_extra_hosts).
- Revoke: soft (revoked_at and a reason); a push service answering 404 / 410 revokes it as `gone`.
- Deliver: runs as the user (row-level security), outside any database transaction while posting.
- VAPID subject: the public URL when it is https, otherwise the address of mail_from (RFC 8292 wants https or mailto).
"""

from __future__ import annotations

import re
import uuid
from datetime import UTC, datetime
from typing import Any
from urllib.parse import urlsplit

from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import ec
from sqlalchemy import func, select, text
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from haalendar.accounts import crypto
from haalendar.config import Environment, Settings
from haalendar.deps import USER_ID_SETTING
from haalendar.errors import ProblemCode, ProblemError
from haalendar.logging import get_logger
from haalendar.push import webpush
from haalendar.push.models import PushKey, PushSubscription

log = get_logger(__name__)

PUSH_SERVICE_HOSTS = (
    "fcm.googleapis.com",
    "jmt17.google.com",  # Chromium builds without Google branding
    "android.googleapis.com",
    "updates.push.services.mozilla.com",
    "push.services.mozilla.com",
    "notify.windows.com",
    "push.apple.com",
)
CLAIM = text("SELECT haalendar_push_claim(:endpoint)")


async def keys(db: AsyncSession, settings: Settings) -> tuple[str, ec.EllipticCurvePrivateKey]:
    """The public key (base64url, uncompressed point) and the private key of this instance."""
    row = await db.get(PushKey, 1)
    if row is None:
        private = ec.generate_private_key(ec.SECP256R1())
        pem = private.private_bytes(
            serialization.Encoding.PEM, serialization.PrivateFormat.PKCS8, serialization.NoEncryption()
        ).decode("ascii")
        await db.execute(
            insert(PushKey)
            .values(
                id=1,
                public_key=webpush.b64url(webpush.public_bytes(private.public_key())),
                private_key_enc=crypto.encrypt_secret(pem, settings.secret_key.get_secret_value()),
            )
            .on_conflict_do_nothing(index_elements=["id"])
        )
        row = await db.get(PushKey, 1, populate_existing=True)
        if row is None:  # pragma: no cover — the insert above or a concurrent one made it
            raise RuntimeError("push key missing")
        log.info("push_keys_created")
    pem = crypto.decrypt_secret(row.private_key_enc, settings.secret_key.get_secret_value())
    loaded = serialization.load_pem_private_key(pem.encode("ascii"), password=None)
    if not isinstance(loaded, ec.EllipticCurvePrivateKey):  # pragma: no cover — we only store EC keys
        raise RuntimeError("push key is not an EC key")
    return row.public_key, loaded


def subject(settings: Settings) -> str:
    if settings.public_url.startswith("https://"):
        return settings.public_url
    found = re.search(r"[\w.+-]+@[\w.-]+", settings.mail_from)
    return f"mailto:{found.group(0) if found else 'admin@localhost'}"


def _endpoint_allowed(endpoint: str, settings: Settings) -> bool:
    parts = urlsplit(endpoint)
    if settings.env != Environment.PRODUCTION:
        return parts.scheme in ("http", "https") and bool(parts.hostname)
    host = (parts.hostname or "").lower()
    extra = tuple(h.strip().lower() for h in settings.push_extra_hosts.split(",") if h.strip())
    return parts.scheme == "https" and any(
        host == allowed or host.endswith(f".{allowed}") for allowed in (*PUSH_SERVICE_HOSTS, *extra)
    )


async def subscribe(
    db: AsyncSession,
    settings: Settings,
    user_id: uuid.UUID,
    endpoint: str,
    p256dh: str,
    auth: str,
    user_agent: str | None,
) -> PushSubscription:
    if not _endpoint_allowed(endpoint, settings):
        raise ProblemError(422, ProblemCode.VALIDATION_FAILED, "This push service is not supported")
    try:
        if len(webpush.b64url_decode(p256dh)) != 65 or len(webpush.b64url_decode(auth)) != 16:
            raise ValueError
    except ValueError:
        raise ProblemError(422, ProblemCode.VALIDATION_FAILED, "Invalid subscription keys") from None
    claimed = await db.scalar(CLAIM, {"endpoint": endpoint})
    row = await db.scalar(
        select(PushSubscription).where(
            PushSubscription.owner_id == user_id,
            PushSubscription.endpoint == endpoint,
            PushSubscription.revoked_at.is_(None),
        )
    )
    if row is None:
        row = PushSubscription(id=uuid.uuid7(), owner_id=user_id, endpoint=endpoint, p256dh=p256dh, auth=auth)
        db.add(row)
    row.p256dh, row.auth = p256dh, auth
    row.user_agent = (user_agent or "")[:200] or None
    await db.flush()
    log.info("push_subscribed", user_id=str(user_id), subscription_id=str(row.id), claimed=claimed or 0)
    return row


async def revoke(db: AsyncSession, user_id: uuid.UUID, subscription_id: uuid.UUID, reason: str) -> None:
    row = await db.get(PushSubscription, subscription_id)
    if row is None or row.owner_id != user_id:
        raise ProblemError(404, ProblemCode.NOT_FOUND, "Not found")
    if row.revoked_at is None:
        row.revoked_at, row.revoke_reason = datetime.now(UTC), reason
        await db.flush()
        log.info("push_revoked", user_id=str(user_id), subscription_id=str(row.id), reason=reason)


async def _as(db: AsyncSession, user_id: uuid.UUID) -> None:
    await db.execute(select(func.set_config(USER_ID_SETTING, str(user_id), True)))


async def deliver(
    factory: async_sessionmaker[AsyncSession], settings: Settings, user_id: uuid.UUID, message: dict[str, Any]
) -> int:
    """Sends `message` to every active browser of the user; the number reached. Never raises for a push failure."""
    async with factory() as db, db.begin():
        await _as(db, user_id)
        targets = (
            await db.scalars(
                select(PushSubscription).where(
                    PushSubscription.owner_id == user_id, PushSubscription.revoked_at.is_(None)
                )
            )
        ).all()
        if not targets:
            return 0
        _public, private = await keys(db, settings)
        found = [(row.id, row.endpoint, row.p256dh, row.auth) for row in targets]
    results: list[tuple[uuid.UUID, webpush.Delivery]] = []
    for sub_id, endpoint, p256dh, auth in found:
        if not _endpoint_allowed(endpoint, settings):
            continue
        results.append(
            (sub_id, await webpush.send(endpoint, p256dh, auth, message, private, subject(settings)))
        )
    now = datetime.now(UTC)
    async with factory() as db, db.begin():
        await _as(db, user_id)
        for sub_id, delivery in results:
            row = await db.get(PushSubscription, sub_id)
            if row is None:
                continue
            if delivery.ok:
                row.last_sent_at = now
            elif delivery.gone and row.revoked_at is None:
                row.revoked_at, row.revoke_reason = now, "gone"
    reached = sum(1 for _, delivery in results if delivery.ok)
    log.info(
        "push_delivered",
        user_id=str(user_id),
        browsers=len(found),
        reached=reached,
        statuses=sorted({delivery.status for _, delivery in results}),
    )
    return reached
