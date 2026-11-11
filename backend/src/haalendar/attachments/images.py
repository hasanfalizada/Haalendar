"""Attachment image processing (FR-X-11, owner decision D-45; ASVS 5.0 V5 File Handling).

+++===+++ 2026-10-17 — Hasan Alizada — HAAL-040.
- The file signature decides the type (PNG, JPEG, WebP, GIF); the declared Content-Type and the name never do.
- Limits before any pixel is decoded: 10 MB, 40 megapixels (decompression bombs), 300 frames.
- Still PNG, JPEG and WebP images are decoded, turned upright by their EXIF orientation and written anew: no original
  byte survives, so EXIF/GPS metadata and polyglot payloads are gone (PNG without loss, JPEG and WebP at quality 95).
  GIF and animated WebP are kept as sent after validation (re-encoding animations would change them; GIF carries no
  EXIF).
- A thumbnail (WebP, at most 320 px, first frame) is made at the same time.
CPU-bound; callers run it in a worker thread.
"""

from __future__ import annotations

import io
import warnings
from dataclasses import dataclass

from PIL import Image, ImageOps, UnidentifiedImageError

from haalendar.errors import ProblemCode, ProblemError
from haalendar.logging import get_logger
from haalendar.security.uploads import MAX_IMAGE_BYTES, detect_image_type

log = get_logger(__name__)

MAX_PIXELS = 40_000_000
MAX_FRAMES = 300
THUMBNAIL_SIZE = 320
PILLOW_FORMATS = {"image/png": "PNG", "image/jpeg": "JPEG", "image/webp": "WEBP", "image/gif": "GIF"}


@dataclass(frozen=True, slots=True)
class ProcessedImage:
    media_type: str
    data: bytes
    width: int
    height: int
    thumbnail: bytes
    reencoded: bool


def _too_large(detail: str, **fields: object) -> ProblemError:
    log.warning("attachment_rejected_size", **fields)
    return ProblemError(413, ProblemCode.PAYLOAD_TOO_LARGE, detail)


def _thumbnail(image: Image.Image) -> bytes:
    frame = image.convert("RGBA" if "A" in image.getbands() or image.mode == "P" else "RGB")
    frame.thumbnail((THUMBNAIL_SIZE, THUMBNAIL_SIZE), Image.Resampling.LANCZOS)
    out = io.BytesIO()
    frame.save(out, format="WEBP", quality=80, method=4)
    return out.getvalue()


def _reencode(image: Image.Image, media_type: str) -> bytes:
    out = io.BytesIO()
    if media_type == "image/png":
        image.save(out, format="PNG")
    elif media_type == "image/jpeg":
        rgb = image if image.mode in ("RGB", "L") else image.convert("RGB")
        rgb.save(out, format="JPEG", quality=95)
    else:
        image.save(out, format="WEBP", quality=95, method=4)
    return out.getvalue()


def process_attachment(data: bytes) -> ProcessedImage:
    """Validate and clean an uploaded image; raises 413/415 problems."""
    if len(data) > MAX_IMAGE_BYTES:
        raise _too_large("Images must be 10 MB or smaller", size_bytes=len(data), limit=MAX_IMAGE_BYTES)
    if not data:
        raise ProblemError(415, ProblemCode.UNSUPPORTED_MEDIA_TYPE, "The file is empty")
    media_type = detect_image_type(data[:16])
    if media_type is None:
        log.warning("attachment_rejected_type", signature=data[:8].hex())
        raise ProblemError(
            415, ProblemCode.UNSUPPORTED_MEDIA_TYPE, "Only PNG, JPEG, WebP and GIF images are allowed"
        )
    try:
        with warnings.catch_warnings():
            warnings.simplefilter("error", Image.DecompressionBombWarning)
            with Image.open(io.BytesIO(data), formats=[PILLOW_FORMATS[media_type]]) as image:
                if image.width * image.height > MAX_PIXELS:
                    raise _too_large("The image has too many pixels", width=image.width, height=image.height)
                frames = int(getattr(image, "n_frames", 1))
                if frames > MAX_FRAMES:
                    raise _too_large("The animation has too many frames", frames=frames, limit=MAX_FRAMES)
                image.load()
                if media_type == "image/gif" or frames > 1:
                    image.seek(0)
                    result = ProcessedImage(
                        media_type, data, image.width, image.height, _thumbnail(image), False
                    )
                else:
                    upright = ImageOps.exif_transpose(image)
                    result = ProcessedImage(
                        media_type,
                        _reencode(upright, media_type),
                        upright.width,
                        upright.height,
                        _thumbnail(upright),
                        True,
                    )
    except ProblemError:
        raise
    except (UnidentifiedImageError, OSError, ValueError, SyntaxError, EOFError, Image.DecompressionBombError,
            Image.DecompressionBombWarning) as exc:  # fmt: skip
        log.warning("attachment_rejected_invalid", detected=media_type, error_type=type(exc).__name__)
        raise ProblemError(415, ProblemCode.UNSUPPORTED_MEDIA_TYPE, "The file is not a valid image") from None
    log.info(
        "attachment_processed",
        media_type=media_type,
        source_bytes=len(data),
        result_bytes=len(result.data),
        reencoded=result.reencoded,
        frames=frames,
    )
    return result
