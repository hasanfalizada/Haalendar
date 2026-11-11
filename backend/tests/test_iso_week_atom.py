"""Atom calendar.iso_week.v1: the Python implementation must pass the shared cases.

+++===+++ 2026-10-23 — Hasan Alizada — HAAL-062.
"""

from __future__ import annotations

import json
from datetime import date
from pathlib import Path
from typing import Any

import pytest

from haalendar.atoms.calendar.iso_week import iso_week

VECTORS = Path(__file__).resolve().parents[2] / "atoms" / "calendar.iso_week.v1" / "vectors.json"
CASES: list[dict[str, Any]] = json.loads(VECTORS.read_text(encoding="utf-8"))["cases"]


@pytest.mark.parametrize("case", CASES, ids=[c["name"] for c in CASES])
def test_vector(case: dict[str, Any]) -> None:
    result = iso_week(date.fromisoformat(case["input"]["date"]))
    assert {"week": result.week, "week_year": result.week_year} == case["output"]
