"""Atom items.priority.v1: the Python implementation must pass the shared cases.

+++===+++ 2026-10-17 — Hasan Alizada — HAAL-041.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import pytest

from haalendar.atoms.items.priority import Ranked, filter_ids, normalize, sort

VECTORS = Path(__file__).resolve().parents[2] / "atoms" / "items.priority.v1" / "vectors.json"
CASES: list[dict[str, Any]] = json.loads(VECTORS.read_text(encoding="utf-8"))["cases"]


def _items(raw: list[dict[str, Any]]) -> list[Ranked]:
    return [Ranked(i["id"], i["priority"], i["tiebreak"]) for i in raw]


@pytest.mark.parametrize("case", CASES, ids=[c["name"] for c in CASES])
def test_vector(case: dict[str, Any]) -> None:
    given = case["input"]
    if given["op"] == "normalize":
        assert normalize(given["value"]) == case["output"]
    elif given["op"] == "sort":
        assert sort(_items(given["items"])) == case["output"]
    else:
        assert filter_ids(_items(given["items"]), given["allowed"]) == case["output"]


def test_unknown_priority_is_refused() -> None:
    with pytest.raises(ValueError, match="unknown priority"):
        normalize("urgent")
