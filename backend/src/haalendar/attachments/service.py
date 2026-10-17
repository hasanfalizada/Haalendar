"""Attachment use cases (FR-X-11, owner decision D-45).

+++===+++ 2026-10-17 — Hasan Alizada — HAAL-040.
- Access follows the item's container through the authz atom: reading needs read access, attaching and deleting need
  write access ("write_items"); row-level security applies underneath.
- At most 20 live attachments per item. The image is cleaned (images.process_attachment) in a worker thread, stored
  content-addressed under the uploader's prefix together with its thumbnail; storing the same bytes twice is a no-op.
- Deleting is soft (deleted_at + delete batch); the files stay and the trash can bring the attachment back.
"""

from __future__ import annotations

import asyncio
import uuid
from typing import cast
from urllib.parse import unquote

from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from haalendar.atoms.authz.check import Action
from haalendar.attachments.images import process_attachment
from haalendar.attachments.models import Attachment
from haalendar.attachments.schemas import AttachmentOut, DeleteResultOut
from haalendar.authz import require
from haalendar.errors import ProblemCode, ProblemError
from haalendar.logging import get_logger
from haalendar.planning.models import Item
from haalendar.security.rls import ContainerKind
from haalendar.security.uploads import MAX_IMAGE_BYTES, sanitize_filename
from haalendar.softdelete import soft_delete
from haalendar.storage import Storage

log = get_logger(__name__)

MAX_PER_ITEM = 20
THUMBNAIL_MEDIA_TYPE = "image/webp"


def to_out(row: Attachment) -> AttachmentOut:
    return AttachmentOut(
        id=row.id,
        item_id=row.item_id,
        file_name=row.file_name,
        media_type=row.media_type,  # checked by the table constraint
        size_bytes=row.size_bytes,
        width=row.width,
        height=row.height,
        content_hash=f"b3:{row.content_hash}",
        url=f"/api/v1/attachments/{row.id}",
        thumbnail_url=f"/api/v1/attachments/{row.id}/thumbnail",
        created_at=row.created_at,
        updated_at=row.updated_at,
        created_by=row.created_by,
        updated_by=row.updated_by,
        deleted_at=row.deleted_at,
        delete_batch_id=row.delete_batch_id,
        version=row.version,
    )


async def _item(db: AsyncSession, user_id: uuid.UUID, item_id: uuid.UUID, action: Action) -> Item:
    item = await db.scalar(select(Item).where(Item.id == item_id, Item.deleted_at.is_(None)))
    if item is None:
        raise ProblemError(404, ProblemCode.NOT_FOUND, "Not found")
    await require(db, user_id, action, cast(ContainerKind, item.container_kind), item.container_id)
    return item


async def list_attachments(db: AsyncSession, user_id: uuid.UUID, item_id: uuid.UUID) -> list[Attachment]:
    await _item(db, user_id, item_id, "read")
    rows = await db.scalars(
        select(Attachment)
        .where(Attachment.item_id == item_id, Attachment.deleted_at.is_(None))
        .order_by(Attachment.created_at, Attachment.id)
    )
    return list(rows)


async def upload(
    db: AsyncSession,
    storage: Storage,
    user_id: uuid.UUID,
    item_id: uuid.UUID,
    data: bytes,
    raw_file_name: str,
    attachment_id: uuid.UUID | None,
) -> Attachment:
    item = await _item(db, user_id, item_id, "write_items")
    if attachment_id is not None:
        existing = await db.get(Attachment, attachment_id)
        if existing is not None:
            if existing.item_id != item_id:
                raise ProblemError(409, ProblemCode.DUPLICATE, "This attachment id is already in use")
            log.info("attachment_upload_repeated", attachment_id=str(attachment_id))
            return existing  # the same client-generated id again: the earlier upload stands (idempotent)
    count = await db.scalar(
        select(func.count()).where(Attachment.item_id == item_id, Attachment.deleted_at.is_(None))
    )
    if (count or 0) >= MAX_PER_ITEM:
        log.info("attachment_rejected_limit", item_id=str(item_id), count=count)
        raise ProblemError(
            409, ProblemCode.INVALID_STATE, f"An item can have at most {MAX_PER_ITEM} attachments"
        )

    image = await asyncio.to_thread(process_attachment, data)
    if len(image.data) > MAX_IMAGE_BYTES:
        log.warning("attachment_rejected_size_after_cleaning", size_bytes=len(image.data))
        raise ProblemError(413, ProblemCode.PAYLOAD_TOO_LARGE, "Images must be 10 MB or smaller")
    stored = await asyncio.to_thread(storage.put, user_id, image.data, image.media_type)
    thumbnail = await asyncio.to_thread(storage.put, user_id, image.thumbnail, THUMBNAIL_MEDIA_TYPE)

    row = Attachment(
        id=attachment_id or uuid.uuid7(),
        item_id=item.id,
        container_kind=item.container_kind,
        container_id=item.container_id,
        uploaded_by=user_id,
        file_name=sanitize_filename(unquote(raw_file_name), image.media_type),
        media_type=image.media_type,
        size_bytes=stored.size_bytes,
        width=image.width,
        height=image.height,
        content_hash=stored.content_hash,
        storage_key=stored.key,
        thumbnail_key=thumbnail.key,
        created_by=user_id,
        updated_by=user_id,
    )
    db.add(row)
    try:
        await db.flush()
    except IntegrityError:
        # A client-generated id that already exists where this user cannot see it.
        log.warning("attachment_id_conflict", attachment_id=str(row.id))
        raise ProblemError(409, ProblemCode.DUPLICATE, "This attachment id is already in use") from None
    await db.refresh(row)
    log.info(
        "attachment_uploaded",
        attachment_id=str(row.id),
        item_id=str(item.id),
        user_id=str(user_id),
        media_type=row.media_type,
        size_bytes=row.size_bytes,
    )
    return row


async def _visible(
    db: AsyncSession, user_id: uuid.UUID, attachment_id: uuid.UUID, action: Action
) -> Attachment:
    row = await db.scalar(
        select(Attachment).where(Attachment.id == attachment_id, Attachment.deleted_at.is_(None))
    )
    if row is None:
        raise ProblemError(404, ProblemCode.NOT_FOUND, "Not found")
    await require(db, user_id, action, cast(ContainerKind, row.container_kind), row.container_id)
    return row


async def file_bytes(
    db: AsyncSession, storage: Storage, user_id: uuid.UUID, attachment_id: uuid.UUID, *, thumbnail: bool
) -> tuple[Attachment, bytes]:
    row = await _visible(db, user_id, attachment_id, "read")
    key = row.thumbnail_key if thumbnail else row.storage_key
    data = await asyncio.to_thread(storage.get, key)
    if data is None:
        log.error("attachment_file_missing", attachment_id=str(row.id), thumbnail=thumbnail)
        raise ProblemError(404, ProblemCode.NOT_FOUND, "The file is missing")
    return row, data


async def soft_delete_attachment(
    db: AsyncSession, user_id: uuid.UUID, attachment_id: uuid.UUID
) -> DeleteResultOut:
    row = await _visible(db, user_id, attachment_id, "write_items")
    batch = soft_delete(row, user_id)
    await db.flush()
    await db.refresh(row)
    log.info(
        "attachment_deleted", attachment_id=str(row.id), user_id=str(user_id), delete_batch_id=str(batch)
    )
    assert row.deleted_at is not None
    return DeleteResultOut(id=row.id, deleted_at=row.deleted_at, delete_batch_id=batch)
