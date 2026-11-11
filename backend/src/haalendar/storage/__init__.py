"""File storage port and adapters (ADR-0004 section 5).

+++===+++ 2026-10-15 — Hasan Alizada — HAAL-166. One interface (`put`, `get`, `stat`) for every stored file. Files are
addressed by their BLAKE3 content hash under a per-user prefix, so storing the same bytes twice is a no-op. Files are
never deleted (FR-X-01): a record that stops referencing a file (avatar removed, attachment soft-deleted) keeps the
file. v1.0 ships the local adapter; an S3-compatible adapter follows in v1.1. Downloads always go through the API with
an authorization check.
+++===+++ 2026-10-18 — Hasan Alizada — HAAL-043. Data export archives are service data, not user content (D-48): they
live apart under exports/<owner>/<export id>.zip and are removed when they expire after 7 days.
"""

from __future__ import annotations

import os
import re
import tempfile
import uuid
from dataclasses import dataclass
from pathlib import Path
from typing import Protocol

from blake3 import blake3

from haalendar.config import Settings
from haalendar.logging import get_logger

log = get_logger(__name__)

EXPORT_KEY_PATTERN = re.compile(r"^exports/[0-9a-f-]{36}/[0-9a-f-]{36}\.zip$")
# <owner uuid>/<64 hex BLAKE3>.<extension>
KEY_PATTERN = re.compile(r"^[0-9a-f-]{36}/[0-9a-f]{64}\.(png|jpg|gif|webp)$")
EXTENSIONS = {"image/png": "png", "image/jpeg": "jpg", "image/gif": "gif", "image/webp": "webp"}


@dataclass(frozen=True, slots=True)
class StoredFile:
    key: str
    content_hash: str
    size_bytes: int
    media_type: str


class Storage(Protocol):
    def put(self, owner_id: uuid.UUID, data: bytes, media_type: str) -> StoredFile: ...

    def get(self, key: str) -> bytes | None: ...

    def stat(self, key: str) -> int | None: ...

    def export_key(self, owner_id: uuid.UUID, export_id: uuid.UUID) -> str: ...

    def export_path(self, key: str) -> Path: ...

    def remove_export(self, key: str) -> None: ...


def content_hash(data: bytes) -> str:
    return blake3(data).hexdigest()


class LocalStorage:
    """Files below a root directory; writes are atomic (temporary file + rename) and never overwrite."""

    def __init__(self, root: Path) -> None:
        self.root = root

    def _path(self, key: str) -> Path:
        if not KEY_PATTERN.match(key):
            raise ValueError("invalid storage key")
        return self.root / key

    def put(self, owner_id: uuid.UUID, data: bytes, media_type: str) -> StoredFile:
        digest = content_hash(data)
        key = f"{owner_id}/{digest}.{EXTENSIONS[media_type]}"
        path = self._path(key)
        stored = StoredFile(key=key, content_hash=digest, size_bytes=len(data), media_type=media_type)
        if path.exists():
            log.info("storage_put_deduplicated", key=key)
            return stored
        path.parent.mkdir(mode=0o750, parents=True, exist_ok=True)
        fd, temporary = tempfile.mkstemp(dir=path.parent, prefix=".upload-")
        try:
            with os.fdopen(fd, "wb") as handle:
                handle.write(data)
                handle.flush()
                os.fsync(handle.fileno())
            os.chmod(temporary, 0o640)
            os.replace(temporary, path)
        except BaseException:
            Path(temporary).unlink(
                missing_ok=True
            )  # physical-delete-allowed: our own unfinished temporary upload file
            raise
        log.info("storage_put", key=key, size_bytes=len(data), media_type=media_type)
        return stored

    def get(self, key: str) -> bytes | None:
        path = self._path(key)
        return path.read_bytes() if path.is_file() else None

    def stat(self, key: str) -> int | None:
        path = self._path(key)
        return path.stat().st_size if path.is_file() else None

    def export_key(self, owner_id: uuid.UUID, export_id: uuid.UUID) -> str:
        return f"exports/{owner_id}/{export_id}.zip"

    def export_path(self, key: str) -> Path:
        if not EXPORT_KEY_PATTERN.match(key):
            raise ValueError("invalid export key")
        path = self.root / key
        path.parent.mkdir(mode=0o750, parents=True, exist_ok=True)
        return path

    def remove_export(self, key: str) -> None:
        path = self.export_path(key)
        path.unlink(missing_ok=True)  # physical-delete-allowed: expired export archive, service data (D-48)
        log.info("export_archive_removed", key=key)


def create_storage(settings: Settings) -> Storage:
    root = Path(settings.storage_dir or Path(tempfile.gettempdir()) / "haalendar-storage")
    root.mkdir(mode=0o750, parents=True, exist_ok=True)
    log.info("storage_configured", adapter="local", root=str(root))
    return LocalStorage(root)
