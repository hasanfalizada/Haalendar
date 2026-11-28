"""The settings reference of the admin guide (docs/guide/admin/configuration.md) names every setting, with the app's default.

+++===+++ 2026-11-26 22:20 +04 — Hasan Alizada — HAAL-153 (D-129). A setting added to the app, to compose.yaml, to
.env.production.example or to the backup scripts without a line in the guide fails here, and so does a default in the
guide that is not the app's. The links between the pages of the guides lead to existing files and headings.
"""

from __future__ import annotations

import re
from enum import Enum
from pathlib import Path

from pydantic import SecretStr

from haalendar.config import ENV_PREFIX, Settings

ROOT = Path(__file__).resolve().parents[2]
GUIDE = ROOT / "docs" / "guide"
CONFIGURATION = GUIDE / "admin" / "configuration.md"
VARIABLE = re.compile(r"\b((?:HAALENDAR|POSTGRES|COMPOSE)_[A-Z0-9_]+)\b")


def _rows() -> dict[str, str]:
    """Variable → its default cell, from the tables of the reference."""
    rows = {}
    for line in CONFIGURATION.read_text(encoding="utf-8").splitlines():
        match = re.match(r"\| `([A-Z0-9_]+)` \| ([^|]*) \|", line)
        if match:
            assert match.group(1) not in rows, f"{match.group(1)} is listed twice"
            rows[match.group(1)] = match.group(2).strip()
    return rows


def test_every_setting_of_the_app_is_listed() -> None:
    rows = _rows()
    missing = [
        f"{ENV_PREFIX}{name.upper()}"
        for name in Settings.model_fields
        if f"{ENV_PREFIX}{name.upper()}" not in rows
    ]
    assert not missing, f"not in docs/guide/admin/configuration.md: {missing}"


def test_every_variable_of_the_installation_files_is_listed() -> None:
    rows = _rows()
    files = [
        "compose.yaml",
        ".env.production.example",
        ".env.example",
        "Dockerfile",
        "scripts/backup.sh",
        "scripts/restore.sh",
    ]
    found = {name for file in files for name in VARIABLE.findall((ROOT / file).read_text(encoding="utf-8"))}
    # Not settings: the official PostgreSQL image's own variables, the quiet output the scripts ask Compose for.
    found -= {"POSTGRES_USER", "POSTGRES_DB", "COMPOSE_PROGRESS"}
    found = {name for name in found if not name.endswith("_FILE")}
    missing = sorted(found - set(rows))
    assert not missing, f"not in docs/guide/admin/configuration.md: {missing}"


def _shown(value: object) -> str | None:
    """The default as the guide writes it; None for a default the guide describes in words (empty, secret)."""
    if isinstance(value, SecretStr) or value is None or value == "":
        return None
    if isinstance(value, bool):
        return "true" if value else "false"
    if isinstance(value, Enum):
        return str(value.value)
    return str(value)


def test_the_defaults_are_the_apps() -> None:
    rows = _rows()
    for name, field in Settings.model_fields.items():
        variable = f"{ENV_PREFIX}{name.upper()}"
        shown = _shown(field.default)
        if shown is None:
            assert not rows[variable].startswith("`"), (
                f"{variable}: the app has no plain default, the guide shows one"
            )
            continue
        assert rows[variable] == f"`{shown}`", (
            f"{variable}: the guide says {rows[variable]}, the app `{shown}`"
        )


def _anchor(heading: str) -> str:
    """GitHub's anchor of a heading: lower-case, punctuation dropped, spaces as hyphens."""
    return re.sub(r"[^\w\- ]", "", heading.strip().lower()).replace(" ", "-")


def test_links_between_the_guides_lead_somewhere() -> None:
    pages = [*GUIDE.rglob("*.md"), ROOT / "docs" / "operations" / "deployment.md"]
    assert len(pages) > 3
    for page in pages:
        text = page.read_text(encoding="utf-8")
        for target in re.findall(r"\]\(([^)\s]+)\)", text):
            if re.match(r"[a-z]+:", target):
                continue
            file, _, fragment = target.partition("#")
            path = (page.parent / file).resolve() if file else page
            assert path.exists(), f"{page.relative_to(ROOT)}: no {target}"
            if fragment and path.suffix == ".md":
                content = path.read_text(encoding="utf-8")
                anchors = {_anchor(h) for h in re.findall(r"^#+ (.+)$", content, re.MULTILINE)}
                anchors |= set(re.findall(r'<a id="([^"]+)"></a>', content))
                assert fragment in anchors, (
                    f"{page.relative_to(ROOT)}: no heading #{fragment} in {file or page.name}"
                )
