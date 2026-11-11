"""Atom time.event_days.v1 — Python implementation (contract: atoms/time.event_days.v1/contract.json).

+++===+++ 2026-10-15 — Hasan Alizada — HAAL-169. Pure function; must pass atoms/time.event_days.v1/vectors.json.
Depends on time.local_to_utc.v1 (manifest deps).
"""

from __future__ import annotations

from datetime import date, time, timedelta

from haalendar.atoms.time.local_to_utc import local_to_utc, zone


def event_days(
    *,
    all_day: bool,
    start_date: date,
    end_date: date,
    start_time: time | None,
    end_time: time | None,
    tzid: str,
    viewer_tzid: str,
) -> tuple[date, date]:
    """(first_day, last_day), inclusive, as seen by a viewer in `viewer_tzid`."""
    viewer = zone(viewer_tzid)
    if all_day:
        zone(tzid)  # validate like the timed branch
        return start_date, end_date
    if start_time is None or end_time is None:
        raise ValueError("timed events need start_time and end_time")
    start = local_to_utc(start_date, start_time, tzid).utc.astimezone(viewer)
    end = local_to_utc(end_date, end_time, tzid).utc.astimezone(viewer)
    first_day = start.date()
    last_day = end.date()
    if end > start and end.timetz().replace(tzinfo=None) == time(0, 0):
        last_day -= timedelta(days=1)  # ending exactly at local midnight does not occupy that day
    return first_day, max(first_day, last_day)
