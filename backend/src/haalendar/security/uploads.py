"""Upload validation for image attachments (FR-X-11): type by content (magic bytes), size, safe file names.

+++===+++ 2026-10-15 — Hasan Alizada — HAAL-020. The declared Content-Type and file extension are never trusted; only
the file signature decides. SVG and any other active content are not accepted. Metadata stripping (EXIF/GPS) and
re-encoding are added with the attachment feature (HAAL-040). ASVS 5.0 V5 (File Handling).
"""

from __future__ import annotations

import re
import unicodedata
from dataclasses import dataclass

from haalendar.errors import ProblemCode, ProblemError
from haalendar.logging import get_logger

log = get_logger(__name__)

MAX_IMAGE_BYTES = 10 * 1024 * 1024
MAX_FILENAME_CHARS = 120
EXTENSIONS = {"image/png": "png", "image/jpeg": "jpg", "image/gif": "gif", "image/webp": "webp"}
_UNSAFE_CHARS = re.compile(r'[\x00-\x1f\x7f<>:"/\\|?*]')
_SPACES = re.compile(r"\s+")


def detect_image_type(head: bytes) -> str | None:
    """Media type from the first bytes of the file, or None when it is not an allowed image."""
    if head.startswith(b"\x89PNG\r\n\x1a\n"):
        return "image/png"
    if head.startswith(b"\xff\xd8\xff"):
        return "image/jpeg"
    if head.startswith((b"GIF87a", b"GIF89a")):
        return "image/gif"
    if len(head) >= 12 and head[:4] == b"RIFF" and head[8:12] == b"WEBP":
        return "image/webp"
    return None


def sanitize_filename(name: str, media_type: str) -> str:
    """Display-safe file name: no path parts, control or reserved characters; extension matches the real type."""
    base = name.replace("\\", "/").rsplit("/", 1)[-1]
    base = unicodedata.normalize("NFKC", base)
    base = _UNSAFE_CHARS.sub("", base)
    base = _SPACES.sub(" ", base).strip().lstrip(".")
    stem = base.rsplit(".", 1)[0] if "." in base else base
    stem = stem.strip() or "image"
    extension = EXTENSIONS[media_type]
    return f"{stem[: MAX_FILENAME_CHARS - len(extension) - 1]}.{extension}"


@dataclass(frozen=True, slots=True)
class ValidatedUpload:
    media_type: str
    file_name: str
    size_bytes: int


def validate_image_upload(head: bytes, size_bytes: int, file_name: str) -> ValidatedUpload:
    """Validate an image upload; raises a 413/415 problem otherwise."""
    if size_bytes > MAX_IMAGE_BYTES:
        log.warning("upload_rejected_size", size_bytes=size_bytes, limit=MAX_IMAGE_BYTES)
        raise ProblemError(413, ProblemCode.PAYLOAD_TOO_LARGE, "Images must be 10 MB or smaller")
    if size_bytes == 0:
        raise ProblemError(415, ProblemCode.UNSUPPORTED_MEDIA_TYPE, "The file is empty")
    media_type = detect_image_type(head)
    if media_type is None:
        log.warning("upload_rejected_type", signature=head[:8].hex())
        raise ProblemError(
            415, ProblemCode.UNSUPPORTED_MEDIA_TYPE, "Only PNG, JPEG, WebP and GIF images are allowed"
        )
    return ValidatedUpload(media_type, sanitize_filename(file_name, media_type), size_bytes)
