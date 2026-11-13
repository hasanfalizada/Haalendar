"""security.txt (RFC 9116): where to report a security problem with this installation.

+++===+++ 2026-11-13 21:58 +04 — Hasan Alizada — HAAL-177. Served at /.well-known/security.txt only when the operator
names a contact (HAALENDAR_SECURITY_CONTACT); without it the path stays a 404, as an installation has no contact by
default. Expires is 180 days after the request (the file is made on each request, so it never runs out on a running
installation); Canonical is the address under HAALENDAR_PUBLIC_URL. Added before the web app, which answers every
other path.
"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

from fastapi import FastAPI
from fastapi.responses import PlainTextResponse

from haalendar.config import Settings

PATH = "/.well-known/security.txt"
LIFETIME = timedelta(days=180)


def security_txt(settings: Settings, now: datetime) -> str:
    expires = (now + LIFETIME).astimezone(UTC).strftime("%Y-%m-%dT%H:%M:%SZ")
    return (
        f"Contact: {settings.security_contact}\n"
        f"Expires: {expires}\n"
        "Preferred-Languages: en\n"
        f"Canonical: {settings.public_url.rstrip('/')}{PATH}\n"
    )


def install_security_txt(app: FastAPI, settings: Settings) -> None:
    if not settings.security_contact:
        return

    @app.api_route(PATH, methods=["GET", "HEAD"], include_in_schema=False)
    async def well_known_security_txt() -> PlainTextResponse:
        return PlainTextResponse(
            security_txt(settings, datetime.now(UTC)), headers={"Cache-Control": "no-cache"}
        )
