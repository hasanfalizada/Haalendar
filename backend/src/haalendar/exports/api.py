"""Export HTTP endpoints (contract: api/modules/collab.yaml — exports, export_download).

+++===+++ 2026-10-18 — Hasan Alizada — HAAL-043. Creating an export needs a recent password confirmation (the archive
holds all of the user's data); the job is queued after the request row is committed, so the worker always finds it.
"""

from __future__ import annotations

import uuid

from fastapi import APIRouter, Request, status
from fastapi.responses import FileResponse

from haalendar.accounts.service import require_recent_reauth
from haalendar.deps import AppStorage, Auth, DbSession
from haalendar.exports import service
from haalendar.exports.schemas import ExportIn, ExportListOut, ExportOut

router = APIRouter(prefix="/exports", tags=["export"])


@router.post(
    "", status_code=status.HTTP_202_ACCEPTED, operation_id="requestExport", response_model_exclude_none=True
)
async def request_export(body: ExportIn, request: Request, auth: Auth, db: DbSession) -> ExportOut:
    require_recent_reauth(auth.session)
    row = await service.request_export(db, auth.user.id, list(body.modules), body.include_images)
    out = service.to_out(row)
    await db.commit()  # the worker reads the row in its own transaction
    await request.app.state.jobs.defer_export(row.id, auth.user.id)
    return out


@router.get("", operation_id="listExports", response_model_exclude_none=True)
async def list_exports(auth: Auth, db: DbSession, storage: AppStorage) -> ExportListOut:
    rows = await service.list_exports(db, storage, auth.user.id)
    return ExportListOut(data=[service.to_out(row) for row in rows])


@router.get(
    "/{id}/download",
    operation_id="downloadExport",
    response_class=FileResponse,
    responses={200: {"content": {"application/zip": {}}}},
)
async def download_export(id: uuid.UUID, auth: Auth, db: DbSession, storage: AppStorage) -> FileResponse:
    row, path = await service.archive_for_download(db, storage, auth.user.id, id)
    stamp = (row.finished_at or row.requested_at).strftime("%Y-%m-%d")
    return FileResponse(
        path,
        media_type="application/zip",
        filename=f"haalendar-export-{stamp}.zip",
        headers={"Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff"},
    )
