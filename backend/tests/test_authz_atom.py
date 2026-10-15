"""Atom authz.check.v1: the Python implementation must pass the shared permission matrix.

+++===+++ 2026-10-15 — Hasan Alizada — HAAL-165.
"""

from __future__ import annotations

import json
import uuid
from dataclasses import asdict
from pathlib import Path
from typing import Any

import pytest

from haalendar.atoms.authz.check import check

VECTORS = Path(__file__).resolve().parents[2] / "atoms" / "authz.check.v1" / "vectors.json"
CASES: list[dict[str, Any]] = json.loads(VECTORS.read_text(encoding="utf-8"))["cases"]


@pytest.mark.parametrize("case", CASES, ids=[c["name"] for c in CASES])
def test_vector(case: dict[str, Any]) -> None:
    given = case["input"]
    decision = check(
        uuid.UUID(given["actor"]["id"]),
        given["action"],
        uuid.UUID(given["resource"]["owner_id"]),
        given["resource"]["share_permission"],
    )
    assert asdict(decision) == case["output"]
