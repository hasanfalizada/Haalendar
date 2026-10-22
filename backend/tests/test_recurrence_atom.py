"""Atom calendar.recurrence.v1: the Python implementation must pass the shared cases.

+++===+++ 2026-10-22 — Hasan Alizada — HAAL-066.
"""

from __future__ import annotations

import json
from datetime import date, timedelta
from pathlib import Path
from typing import Any

import pytest

from haalendar.atoms.calendar.recurrence import RecurrenceError, is_supported, occurrences

VECTORS = Path(__file__).resolve().parents[2] / "atoms" / "calendar.recurrence.v1" / "vectors.json"
CASES: list[dict[str, Any]] = json.loads(VECTORS.read_text(encoding="utf-8"))["cases"]


def _run(given: dict[str, Any]) -> list[date]:
    return occurrences(
        start_date=date.fromisoformat(given["start_date"]),
        rrule=given["rrule"],
        exceptions=[date.fromisoformat(d) for d in given["exceptions"]],
        window_from=date.fromisoformat(given["from"]),
        window_to=date.fromisoformat(given["to"]),
    )


@pytest.mark.parametrize("case", CASES, ids=[c["name"] for c in CASES])
def test_vector(case: dict[str, Any]) -> None:
    if "error" in case:
        with pytest.raises(RecurrenceError) as raised:
            _run(case["input"])
        assert raised.value.code == case["error"]
        return
    assert [d.isoformat() for d in _run(case["input"])] == case["output"]["dates"]


def test_largest_daily_window_has_367_dates() -> None:
    start = date(2026, 1, 1)
    dates = occurrences(
        start_date=start,
        rrule="FREQ=DAILY",
        exceptions=[],
        window_from=start,
        window_to=start + timedelta(days=366),
    )
    assert len(dates) == 367


def test_supported_rules() -> None:
    assert is_supported(None) and is_supported("FREQ=YEARLY")
    assert not is_supported("FREQ=HOURLY") and not is_supported(" FREQ=DAILY")
