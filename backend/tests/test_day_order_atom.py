"""Atom calendar.day_order.v1: the Python implementation must pass the shared cases.

+++===+++ 2026-10-22 — Hasan Alizada — HAAL-060.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import pytest

from haalendar.atoms.calendar.day_order import DayEntry, order, title_key

VECTORS = Path(__file__).resolve().parents[2] / "atoms" / "calendar.day_order.v1" / "vectors.json"
CASES: list[dict[str, Any]] = json.loads(VECTORS.read_text(encoding="utf-8"))["cases"]


@pytest.mark.parametrize("case", CASES, ids=[c["name"] for c in CASES])
def test_vector(case: dict[str, Any]) -> None:
    entries = [DayEntry(**entry) for entry in case["input"]["entries"]]
    assert order(entries) == case["output"]["keys"]


def test_title_key_ignores_case_and_accents() -> None:
    assert title_key("Éclair") == "eclair" and title_key("ÄPFEL") == "apfel"
