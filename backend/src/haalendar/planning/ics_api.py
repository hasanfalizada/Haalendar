"""ICS endpoints of a calendar (contract: api/modules/calendar.yaml — calendar_ics_import, calendar_ics_export).

+++===+++ 2026-10-29 — Hasan Alizada — HAAL-095 (D-83). Import takes the file as the request body (text/calendar, at
most 5 MB) and answers with the report; export answers with the file as a download named after the calendar.
"""

from __future__ import annotations

import uuid
from typing import Any
from urllib.parse import quote

from fastapi import APIRouter, Request, Response

from haalendar.deps import Auth, DbSession
from haalendar.errors import ProblemCode, ProblemError
from haalendar.exports.archive import safe_name
from haalendar.planning import ics, ics_service

router = APIRouter(prefix="/calendars", tags=["calendar"])

ACCEPTED = ("text/calendar", "application/octet-stream", "")


@router.post("/{id}/import-ics", operation_id="importIcs")
async def import_ics(id: uuid.UUID, request: Request, auth: Auth, db: DbSession) -> dict[str, Any]:
    media_type = (request.headers.get("content-type") or "").split(";")[0].strip().lower()
    if media_type not in ACCEPTED:
        raise ProblemError(415, ProblemCode.UNSUPPORTED_MEDIA_TYPE, "Send the .ics file as text/calendar")
    declared = request.headers.get("content-length")
    if declared and declared.isdigit() and int(declared) > ics.MAX_BYTES:
        raise ProblemError(413, ProblemCode.PAYLOAD_TOO_LARGE, "The file is larger than 5 MB")
    report = await ics_service.import_ics(db, auth.user.id, id, await request.body())
    return ics_service.report_out(report)


@router.get(
    "/{id}/export.ics",
    operation_id="exportIcs",
    response_class=Response,
    responses={200: {"content": {"text/calendar": {}}}},
)
async def export_ics(id: uuid.UUID, auth: Auth, db: DbSession) -> Response:
    name, text = await ics_service.export_ics(db, auth.user.id, id)
    file_name = safe_name(name, ".ics")
    return Response(
        content=text.encode("utf-8"),
        media_type="text/calendar; charset=utf-8",
        headers={
            "Content-Disposition": f"attachment; filename*=UTF-8''{quote(file_name)}",
            "Cache-Control": "no-store",
            "X-Content-Type-Options": "nosniff",
        },
    )
