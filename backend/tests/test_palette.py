"""Shared palette (FR-X-13, D-47): the contract's Color enum, the backend list and the web app list name the same 8
colours in the same order; items default to brown in the model and in the migration.

+++===+++ 2026-10-18 — Hasan Alizada — HAAL-042.
"""

from __future__ import annotations

import re
from pathlib import Path
from typing import get_args

from haalendar.bulk.schemas import Color
from haalendar.planning.models import COLORS, Item

ROOT = Path(__file__).resolve().parents[2]
LEGACY = ["red", "orange", "yellow", "green", "blue", "purple", "brown", "black"]


def _contract_colors() -> list[str]:
    text = (ROOT / "api" / "components" / "common.yaml").read_text(encoding="utf-8")
    found = re.search(r"\n    Color:\n      type: string\n      enum: \[([^\]]+)\]", text)
    assert found is not None, "Color enum not found in api/components/common.yaml"
    return [c.strip() for c in found.group(1).split(",")]


def _web_app_colors() -> list[str]:
    text = (ROOT / "frontend" / "src" / "lib" / "palette.ts").read_text(encoding="utf-8")
    found = re.search(r"export const COLORS: readonly Color\[\] = \[([^\]]+)\]", text)
    assert found is not None, "COLORS not found in frontend/src/lib/palette.ts"
    return [c.strip().strip('"') for c in found.group(1).split(",")]


def test_contract_backend_and_web_app_share_the_legacy_palette() -> None:
    assert _contract_colors() == LEGACY
    assert list(COLORS) == LEGACY
    assert list(get_args(Color)) == LEGACY
    assert _web_app_colors() == LEGACY


def test_items_default_to_brown() -> None:
    assert Item.__table__.c.color.server_default.arg == "brown"
    migration = (ROOT / "backend" / "migrations" / "versions" / "0010_items_attachments.py").read_text(
        encoding="utf-8"
    )
    assert 'sa.Column("color", sa.String(10), nullable=False, server_default="brown")' in migration
    text = (ROOT / "frontend" / "src" / "lib" / "palette.ts").read_text(encoding="utf-8")
    assert 'export const DEFAULT_COLOR: Color = "brown";' in text
