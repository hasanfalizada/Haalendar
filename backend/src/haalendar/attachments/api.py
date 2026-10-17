"""Attachment HTTP endpoints (contract: api/modules/items.yaml — item_attachments, attachment, attachment_thumbnail).

+++===+++ 2026-10-17 — Hasan Alizada — HAAL-040. Files are served only through the API after the authorization check,
inline with nosniff and a sandboxing CSP; responses for one attachment id never change (content-addressed), so they are
cached privately for a year.
"""

from __future__ import annotations

import uuid
from typing import Annotated
from urllib.parse import quote

from fastapi import APIRouter, Header, Request, Response, status

from haalendar.attachments import service
from haalendar.attachments.schemas import AttachmentListOut, AttachmentOut, DeleteResultOut
from haalendar.deps import AppStorage, Auth, DbSession

items_router = APIRouter(prefix="/items", tags=["items"])
router = APIRouter(prefix="/attachments", tags=["items"])

FILE_CACHE = "private, max-age=31536000, immutable"


@items_router.get("/{id}/attachments", operation_id="listAttachments", response_model_exclude_none=True)
async def list_attachments(id: uuid.UUID, auth: Auth, db: DbSession) -> AttachmentListOut:
    rows = await service.list_attachments(db, auth.user.id, id)
    return AttachmentListOut(data=[service.to_out(row) for row in rows])


@items_router.post(
    "/{id}/attachments",
    status_code=status.HTTP_201_CREATED,
    operation_id="uploadAttachment",
    response_model_exclude_none=True,
)
async def upload_attachment(
    id: uuid.UUID,
    request: Request,
    auth: Auth,
    db: DbSession,
    storage: AppStorage,
    x_file_name: Annotated[str, Header(min_length=1, max_length=1024)],
    x_attachment_id: Annotated[uuid.UUID | None, Header()] = None,
    idempotency_key: Annotated[uuid.UUID | None, Header()] = None,
) -> AttachmentOut:
    # Idempotency-Key is accepted per contract; a repeated upload with the same X-Attachment-Id returns the first one.
    row = await service.upload(
        db, storage, auth.user.id, id, await request.body(), x_file_name, x_attachment_id
    )
    return service.to_out(row)


def _file_response(data: bytes, media_type: str, file_name: str) -> Response:
    return Response(
        content=data,
        media_type=media_type,
        headers={
            "Cache-Control": FILE_CACHE,
            "Content-Disposition": f"inline; filename*=UTF-8''{quote(file_name)}",
            "Content-Security-Policy": "default-src 'none'; sandbox",
            "X-Content-Type-Options": "nosniff",
        },
    )


@router.get(
    "/{id}",
    operation_id="downloadAttachment",
    response_class=Response,
    responses={200: {"content": {"image/*": {}}}},
)
async def download_attachment(id: uuid.UUID, auth: Auth, db: DbSession, storage: AppStorage) -> Response:
    row, data = await service.file_bytes(db, storage, auth.user.id, id, thumbnail=False)
    return _file_response(data, row.media_type, row.file_name)


@router.get(
    "/{id}/thumbnail",
    operation_id="downloadAttachmentThumbnail",
    response_class=Response,
    responses={200: {"content": {"image/webp": {}}}},
)
async def download_attachment_thumbnail(
    id: uuid.UUID, auth: Auth, db: DbSession, storage: AppStorage
) -> Response:
    row, data = await service.file_bytes(db, storage, auth.user.id, id, thumbnail=True)
    stem = row.file_name.rsplit(".", 1)[0]
    return _file_response(data, service.THUMBNAIL_MEDIA_TYPE, f"{stem}-thumbnail.webp")


@router.delete("/{id}", operation_id="deleteAttachment")
async def delete_attachment(id: uuid.UUID, auth: Auth, db: DbSession) -> DeleteResultOut:
    return await service.soft_delete_attachment(db, auth.user.id, id)
