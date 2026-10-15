"""Avatar processing (FR-ACC-08): validate an uploaded image and re-encode it to a 256x256 WebP.

+++===+++ 2026-10-15 — Hasan Alizada — HAAL-166. ASVS 5.0 V5 (File Handling):
- the file signature decides the type (PNG, JPEG, WebP); the declared Content-Type and any name are ignored;
- size ≤ 2 MiB and ≤ 40 megapixels (decompression bombs are refused before pixels are decoded);
- the image is decoded, oriented by EXIF, cropped to a square and written anew: no original byte survives, so EXIF/GPS
  metadata and polyglot payloads are gone. Animated images keep their first frame.
CPU-bound; callers run it in a worker thread.
"""

from __future__ import annotations

import io
import warnings

from PIL import Image, ImageOps, UnidentifiedImageError

from haalendar.errors import ProblemCode, ProblemError
from haalendar.logging import get_logger
from haalendar.security.uploads import AVATAR_TYPES, MAX_AVATAR_BYTES, detect_image_type

log = get_logger(__name__)

AVATAR_SIZE = 256
MAX_AVATAR_PIXELS = 40_000_000
PILLOW_FORMATS = {"image/png": "PNG", "image/jpeg": "JPEG", "image/webp": "WEBP"}


def process_avatar(data: bytes) -> bytes:
    """Return the re-encoded WebP bytes or raise 413/415 problems."""
    if len(data) > MAX_AVATAR_BYTES:
        log.warning("avatar_rejected_size", size_bytes=len(data), limit=MAX_AVATAR_BYTES)
        raise ProblemError(413, ProblemCode.PAYLOAD_TOO_LARGE, "The image must not exceed 2 MB")
    media_type = detect_image_type(data[:16])
    if media_type not in AVATAR_TYPES:
        log.warning("avatar_rejected_type", detected=media_type)
        raise ProblemError(415, ProblemCode.UNSUPPORTED_MEDIA_TYPE, "Use a PNG, JPEG or WebP image")
    try:
        with warnings.catch_warnings():
            warnings.simplefilter("error", Image.DecompressionBombWarning)
            with Image.open(io.BytesIO(data), formats=[PILLOW_FORMATS[media_type]]) as image:
                if image.width * image.height > MAX_AVATAR_PIXELS:
                    log.warning("avatar_rejected_pixels", width=image.width, height=image.height)
                    raise ProblemError(413, ProblemCode.PAYLOAD_TOO_LARGE, "The image has too many pixels")
                oriented = ImageOps.exif_transpose(image)
                converted = oriented.convert("RGBA" if "A" in oriented.getbands() else "RGB")
                square = ImageOps.fit(converted, (AVATAR_SIZE, AVATAR_SIZE), Image.Resampling.LANCZOS)
                out = io.BytesIO()
                square.save(out, format="WEBP", quality=85, method=4)
    except ProblemError:
        raise
    except (UnidentifiedImageError, OSError, ValueError, SyntaxError, Image.DecompressionBombError,
            Image.DecompressionBombWarning) as exc:  # fmt: skip
        log.warning("avatar_rejected_invalid", error_type=type(exc).__name__)
        raise ProblemError(415, ProblemCode.UNSUPPORTED_MEDIA_TYPE, "The file is not a valid image") from None
    result = out.getvalue()
    log.info("avatar_processed", source_type=media_type, source_bytes=len(data), result_bytes=len(result))
    return result
