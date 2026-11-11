"""Atom calendar.recurrence: the Python implementation must pass the shared cases.

+++===+++ 2026-10-22 — Hasan Alizada — HAAL-066.
+++===+++ 2026-10-29 — Hasan Alizada — HAAL-092. Version 2: its vectors, the rule check and the reading of rules.
"""

from __future__ import annotations

import json
from datetime import date, timedelta
from pathlib import Path
from typing import Any

import pytest

from haalendar.atoms.calendar.recurrence import (
    RecurrenceError,
    Rule,
    StartNotInRuleError,
    UnsupportedRruleError,
    check,
    is_supported,
    occurrences,
    parse_rule,
)

VECTORS = Path(__file__).resolve().parents[2] / "atoms" / "calendar.recurrence.v2" / "vectors.json"
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
    assert is_supported("FREQ=WEEKLY;INTERVAL=2;BYDAY=MO,WE;UNTIL=20271231")


def test_rules_are_read_into_their_parts() -> None:
    assert parse_rule("FREQ=WEEKLY;INTERVAL=2;BYDAY=WE,MO;COUNT=10") == Rule(
        "WEEKLY", 2, weekdays=(0, 2), count=10
    )
    assert parse_rule("FREQ=MONTHLY;BYDAY=-1FR;UNTIL=20271231") == Rule(
        "MONTHLY", nth=(-1, 4), until=date(2027, 12, 31)
    )
    assert parse_rule("FREQ=MONTHLY;BYMONTHDAY=-1") == Rule("MONTHLY", month_day=-1)


def test_check_tells_whether_the_start_fits() -> None:
    check(date(2026, 10, 22), None)
    check(date(2026, 10, 22), "FREQ=WEEKLY;BYDAY=TH")
    with pytest.raises(StartNotInRuleError):
        check(date(2026, 10, 22), "FREQ=WEEKLY;BYDAY=MO")
    with pytest.raises(UnsupportedRruleError):
        check(date(2026, 10, 22), "FREQ=WEEKLY;BYDAY=XX")


def test_a_long_counted_series_far_from_its_start() -> None:
    # 31st of the month, every month, 999 times from 1950: the counting stops once the series has ended.
    found = occurrences(
        start_date=date(1950, 1, 31),
        rrule="FREQ=MONTHLY;COUNT=999",
        exceptions=[],
        window_from=date(2026, 1, 1),
        window_to=date(2026, 12, 31),
    )
    assert found == [date(2026, m, 31) for m in (1, 3, 5, 7, 8, 10, 12)]
