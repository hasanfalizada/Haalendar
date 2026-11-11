"""Settings HTTP endpoints (contract: api/modules/accounts.yaml — me_settings).

+++===+++ 2026-10-19 — Hasan Alizada — HAAL-045. GET returns the settings (with the defaults on first use); PATCH is a
JSON merge patch guarded by If-Match. Both send the version as ETag.
"""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Header, Response

from haalendar.api.preconditions import expected_version
from haalendar.deps import Auth, DbSession
from haalendar.preferences import service
from haalendar.preferences.schemas import SettingsOut, SettingsPatchIn

router = APIRouter(prefix="/me/settings", tags=["account"])


@router.get("", operation_id="getSettings")
async def get_settings(response: Response, auth: Auth, db: DbSession) -> SettingsOut:
    row = await service.get_settings(db, auth.user.id)
    response.headers["ETag"] = f'"{row.version}"'
    return service.to_out(row)


@router.patch("", operation_id="updateSettings")
async def update_settings(
    body: SettingsPatchIn,
    response: Response,
    auth: Auth,
    db: DbSession,
    if_match: Annotated[str | None, Header()] = None,
) -> SettingsOut:
    row = await service.update_settings(db, auth.user.id, body, expected_version=expected_version(if_match))
    response.headers["ETag"] = f'"{row.version}"'
    return service.to_out(row)
