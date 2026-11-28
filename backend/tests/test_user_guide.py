"""The user guide (docs/guide/user/) lists every keyboard shortcut of the web app and shows the pictures it names.

+++===+++ 2026-11-26 23:55 +04 — Hasan Alizada — HAAL-153 (D-129, stage 2). The keys are read from the web app's
sources (`keys: [...]` of each registered shortcut), so a shortcut added without a line in shortcuts.md fails here.
"""

from __future__ import annotations

import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
USER = ROOT / "docs" / "guide" / "user"
SOURCES = ROOT / "frontend" / "src"


def _app_keys() -> set[str]:
    keys: set[str] = set()
    for source in [*SOURCES.rglob("*.ts"), *SOURCES.rglob("*.tsx")]:
        if ".test." in source.name:
            continue
        text = source.read_text(encoding="utf-8")
        for group in re.findall(r"(?:keys: |_KEYS = )\[([^\]]*)\]", text):
            keys.update(re.findall(r'"([^"]+)"', group))
            if "Alt+${" in group:  # the modules' digits (nav-items.ts)
                keys.update(f"Alt+{d}" for d in re.findall(r'shortcutDigit: "(\d)"', _nav_items()))
    return keys


def _nav_items() -> str:
    return (SOURCES / "components" / "shell" / "nav-items.ts").read_text(encoding="utf-8")


def test_every_shortcut_of_the_app_is_in_the_guide() -> None:
    keys = _app_keys()
    assert {"Mod+K", "?", "N", "Alt+1"} <= keys, f"the pattern no longer finds the shortcuts: {sorted(keys)}"
    listed = set(re.findall(r"`([^`]+)`", (USER / "shortcuts.md").read_text(encoding="utf-8")))
    missing = sorted(keys - listed)
    assert not missing, f"keys of the app not in docs/guide/user/shortcuts.md: {missing}"


def test_every_picture_of_the_guide_exists_and_is_used() -> None:
    used: set[Path] = set()
    for page in USER.glob("*.md"):
        for target in re.findall(r"!\[[^\]]*\]\(([^)]+)\)", page.read_text(encoding="utf-8")):
            path = (page.parent / target).resolve()
            assert path.is_file(), f"{page.name}: no picture {target}"
            used.add(path)
    unused = sorted(p.name for p in (USER / "images").glob("*.png") if p.resolve() not in used)
    assert not unused, f"pictures of docs/guide/user/images that no page shows: {unused}"


def test_help_links_to_the_user_guide() -> None:
    about = (SOURCES / "lib" / "about.ts").read_text(encoding="utf-8")
    found = re.search(r"DOCS_URL = `\$\{REPOSITORY_URL\}/blob/master/([^`]+)`", about)
    assert found, "DOCS_URL no longer points to a file of the repository"
    assert found.group(1) == "docs/guide/user/README.md"
    assert (ROOT / found.group(1)).is_file()
