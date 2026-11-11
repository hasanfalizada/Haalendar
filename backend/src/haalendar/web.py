"""The web app served by the API itself (ADR-0004: one origin, no CORS, simple secure cookies).

+++===+++ 2026-11-01 — Hasan Alizada — HAAL-150. The built SPA (frontend/dist, /app/static in the image) is served
from HAALENDAR_STATIC_DIR when it is set:
- a file that exists is sent as it is; hashed build output under /assets/ is cached for a year (`immutable`), every
  other file (index.html, the service worker, the manifest, icons) is revalidated on each use (`no-cache`), so a new
  release reaches the browser at once;
- any other path without a file extension is a route of the app: index.html (the router of the app shows its own
  "not found" page); a missing file with an extension is a 404;
- /api/ and /metrics are never answered here: an unknown API path stays an API problem (404).
The security headers (the strict SPA Content-Security-Policy among them) come from RequestContextMiddleware.
"""

from __future__ import annotations

from pathlib import Path, PurePosixPath

from fastapi import FastAPI, Request
from fastapi.responses import FileResponse

from haalendar.config import Settings
from haalendar.errors import ProblemCode, ProblemError
from haalendar.logging import get_logger

log = get_logger(__name__)

IMMUTABLE = "public, max-age=31536000, immutable"
REVALIDATE = "no-cache"
RESERVED = ("api", "metrics")


def _file(root: Path, path: str) -> Path | None:
    """The file under root that the URL path names, or None (also for anything outside root)."""
    parts = PurePosixPath(path).parts
    if any(part in ("..", ".") or part.startswith(".") for part in parts):
        return None
    candidate = (root / Path(*parts)).resolve() if parts else root / "index.html"
    if not candidate.is_relative_to(root) or not candidate.is_file():
        return None
    return candidate


def install_web_app(app: FastAPI, settings: Settings) -> None:
    """Serve the built web app for every path the API does not own (added after all API routes)."""
    if not settings.static_dir:
        log.info("web_app_not_served")
        return
    root = Path(settings.static_dir).resolve()
    index = root / "index.html"
    if not index.is_file():
        raise RuntimeError(f"HAALENDAR_STATIC_DIR has no index.html: {root}")

    @app.api_route("/{path:path}", methods=["GET", "HEAD"], include_in_schema=False)
    async def web_app(path: str, request: Request) -> FileResponse:
        if path.split("/", 1)[0] in RESERVED:
            raise ProblemError(404, ProblemCode.NOT_FOUND, "Not found")
        found = _file(root, path)
        if found is not None:
            immutable = found.is_relative_to(root / "assets")
            return FileResponse(found, headers={"Cache-Control": IMMUTABLE if immutable else REVALIDATE})
        if PurePosixPath(path).suffix:
            raise ProblemError(404, ProblemCode.NOT_FOUND, "Not found")
        return FileResponse(index, headers={"Cache-Control": REVALIDATE})

    log.info("web_app_served", static_dir=str(root))
