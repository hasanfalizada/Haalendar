"""Atom calendar.week_ab_label.v1: the Python implementation must pass the shared cases.

+++===+++ 2026-10-19 — Hasan Alizada — HAAL-045.
"""

from __future__ import annotations

import json
from datetime import date, timedelta
from pathlib import Path
from typing import Any

import pytest

from haalendar.atoms.calendar.week_ab_label import LabelsNotDistinctError, label_week, week_start_of

VECTORS = Path(__file__).resolve().parents[2] / "atoms" / "calendar.week_ab_label.v1" / "vectors.json"
CASES: list[dict[str, Any]] = json.loads(VECTORS.read_text(encoding="utf-8"))["cases"]


@pytest.mark.parametrize("case", CASES, ids=[c["name"] for c in CASES])
def test_vector(case: dict[str, Any]) -> None:
    given = case["input"]
    args = {
        "day": date.fromisoformat(given["date"]),
        "anchor": date.fromisoformat(given["anchor"]),
        "week_start": given["week_start"],
        "labels": tuple(given["labels"]),
    }
    if "error" in case:
        with pytest.raises(LabelsNotDistinctError) as raised:
            label_week(**args)
        assert raised.value.code == case["error"]
        return
    result = label_week(**args)
    assert {
        "label": result.label,
        "index": result.index,
        "weeks_from_anchor": result.weeks_from_anchor,
    } == case["output"]


@pytest.mark.parametrize("week_start", range(7))
def test_every_day_of_a_week_gets_the_same_label(week_start: int) -> None:
    anchor = date(2026, 10, 19)
    first = week_start_of(date(2027, 3, 3), week_start)
    labels = {
        label_week(
            day=first + timedelta(days=d), anchor=anchor, week_start=week_start, labels=("A", "B")
        ).label
        for d in range(7)
    }
    assert len(labels) == 1
    assert first.isoweekday() % 7 == week_start


def test_week_start_out_of_range_is_refused() -> None:
    with pytest.raises(ValueError, match="week_start"):
        week_start_of(date(2026, 1, 1), 7)
