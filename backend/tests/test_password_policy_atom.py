"""Atom accounts.password_policy.v1: the Python implementation must pass every shared test vector.

+++===+++ 2026-10-15 — Hasan Alizada — HAAL-160.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import pytest

from haalendar.atoms.accounts.password_policy import check_password

VECTORS = Path(__file__).resolve().parents[2] / "atoms" / "accounts.password_policy.v1" / "vectors.json"
CASES: list[dict[str, Any]] = json.loads(VECTORS.read_text(encoding="utf-8"))["cases"]


@pytest.mark.parametrize("case", CASES, ids=[c["name"] for c in CASES])
def test_vector(case: dict[str, Any]) -> None:
    given = case["input"]
    violations = check_password(given["password"], given.get("email"), given.get("display_name"))
    assert {"valid": not violations, "violations": violations} == case["output"]
