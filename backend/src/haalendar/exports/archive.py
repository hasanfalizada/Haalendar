"""Building the export archive (owner decision D-48, Google-Takeout style).

+++===+++ 2026-10-18 — Hasan Alizada — HAAL-043. A ZIP with:
- archive.json — everything in one document following the published schema (haalendar-export-1.0.schema.json next to
  this module, copied into the archive as schema/…); soft-deleted records included with deleted_at;
- one folder per module with standard formats: calendar/<calendar>.ics (iCalendar, RFC 5545; live events only, for
  importing elsewhere), the images of attachments when chosen;
- README.html — what is inside and how to read it.
Rows are spooled per section (memory stays small for large accounts) and assembled into archive.json at the end.
"""

from __future__ import annotations

import html
import json
import re
import tempfile
import unicodedata
import uuid
import zipfile
from dataclasses import dataclass, field
from datetime import UTC, date, datetime
from pathlib import Path
from typing import IO, Any

SCHEMA_VERSION = "1.0"
SCHEMA_FILE = "haalendar-export-1.0.schema.json"
# Shipped with the code (documented in docs/export/README.md), so every archive carries the schema it follows.
SCHEMA_SOURCE = Path(__file__).with_name(SCHEMA_FILE)
# Every top-level list of archive.json, in document order (schema 1.0); sections fill the ones they own.
SECTION_KEYS = (
    "calendars",
    "events",
    "notes",
    "boards",
    "labels",
    "checklist_items",
    "comments",
    "links",
    "reminders",
    "attachments",
)
_UNSAFE = re.compile(r'[\x00-\x1f\x7f<>:"/\\|?*]')


def _json_default(value: object) -> str:
    if isinstance(value, datetime):
        return value.astimezone(UTC).isoformat().replace("+00:00", "Z")
    if isinstance(value, date):
        return value.isoformat()
    if isinstance(value, uuid.UUID):
        return str(value)
    raise TypeError(f"not serializable: {type(value).__name__}")


def dumps(value: object) -> str:
    return json.dumps(value, ensure_ascii=False, default=_json_default)


def safe_name(name: str, suffix: str = "") -> str:
    """A file name that is valid everywhere: no separators or reserved characters, short, never empty."""
    clean = _UNSAFE.sub("", unicodedata.normalize("NFKC", name)).strip().strip(".") or "untitled"
    return f"{clean[:80]}{suffix}"


# +++===+++ 2026-10-29 — Hasan Alizada — HAAL-095. The iCalendar writer moved to haalendar.planning.ics (D-83).


# ---------------------------------------------------------------- the archive


@dataclass
class ArchiveWriter:
    """Collects section rows and files, then writes the ZIP. Use as a context manager."""

    path: Path
    header: dict[str, Any]
    counts: dict[str, int] = field(default_factory=dict)
    files: list[tuple[str, int]] = field(default_factory=list)
    _spools: dict[str, IO[str]] = field(default_factory=dict)
    _zip: zipfile.ZipFile | None = None

    def __enter__(self) -> ArchiveWriter:
        self._zip = zipfile.ZipFile(self.path, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=6)
        return self

    def __exit__(self, *exc: object) -> None:
        for spool in self._spools.values():
            spool.close()
        if self._zip is not None:
            self._zip.close()

    def add_row(self, key: str, row: dict[str, Any]) -> None:
        if key not in SECTION_KEYS:
            raise ValueError(f"unknown section {key}")
        spool = self._spools.get(key)
        if spool is None:
            spool = tempfile.SpooledTemporaryFile(max_size=8 * 1024 * 1024, mode="w+", encoding="utf-8")  # noqa: SIM115 — closed in __exit__
            self._spools[key] = spool
        if self.counts.get(key):
            spool.write(",")
        spool.write(dumps({k: v for k, v in row.items() if v is not None}))
        self.counts[key] = self.counts.get(key, 0) + 1

    def add_file(self, name: str, data: bytes | str) -> None:
        assert self._zip is not None
        payload = data.encode("utf-8") if isinstance(data, str) else data
        self._zip.writestr(name, payload)
        self.files.append((name, len(payload)))

    def finish(self, readme: str) -> None:
        """Write archive.json, the schema and README.html."""
        assert self._zip is not None
        with self._zip.open("archive.json", "w") as raw:
            raw.write(dumps({"$schema": f"schema/{SCHEMA_FILE}", **self.header})[:-1].encode("utf-8"))
            for key in SECTION_KEYS:
                raw.write(f', "{key}": ['.encode())
                spool = self._spools.get(key)
                if spool is not None:
                    spool.seek(0)
                    while chunk := spool.read(1 << 16):
                        raw.write(chunk.encode("utf-8"))
                raw.write(b"]")
            raw.write(b"}")
        self._zip.writestr(f"schema/{SCHEMA_FILE}", SCHEMA_SOURCE.read_bytes())
        self._zip.writestr("README.html", readme)


def readme_html(header: dict[str, Any], counts: dict[str, int], files: list[tuple[str, int]]) -> str:
    user = header.get("user", {})
    rows = "".join(
        f"<tr><td>{html.escape(key)}</td><td>{counts.get(key, 0)}</td></tr>" for key in SECTION_KEYS
    )
    listing = "".join(f"<li><code>{html.escape(name)}</code> ({size} bytes)</li>" for name, size in files)
    return f"""<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>Haalendar export</title>
<style>body{{font:15px/1.5 system-ui,sans-serif;max-width:46rem;margin:2rem auto;padding:0 1rem;color:#111827}}
table{{border-collapse:collapse}}td,th{{border:1px solid #d9e2e2;padding:.25rem .6rem;text-align:left}}
code{{background:#f5f8f8;padding:0 .2rem}}</style></head><body>
<h1>Haalendar export</h1>
<p>Exported {html.escape(str(header.get("exported_at", "")))} for {html.escape(str(user.get("display_name", "")))}
({html.escape(str(user.get("email", "")))}). Modules: {html.escape(", ".join(header.get("modules", [])))}.</p>
<h2>What is inside</h2>
<ul>
<li><code>archive.json</code> — all your data in one file, deleted items included (with <code>deleted_at</code>).
Its format is described by <code>schema/{SCHEMA_FILE}</code> (JSON Schema, version {SCHEMA_VERSION}).</li>
<li><code>calendar/*.ics</code> — your calendars in iCalendar format, to import into another calendar app
(active events only).</li>
<li><code>calendar/attachments/</code> — the images attached to your items, if you chose to include them.</li>
</ul>
<h2>Records</h2><table><tr><th>Section</th><th>Count</th></tr>{rows}</table>
<h2>Files</h2><ul>{listing or "<li>none</li>"}</ul>
</body></html>
"""
