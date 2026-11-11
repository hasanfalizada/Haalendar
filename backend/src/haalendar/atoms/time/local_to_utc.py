"""Atom time.local_to_utc.v1 — Python implementation (contract: atoms/time.local_to_utc.v1/contract.json).

+++===+++ 2026-10-15 — Hasan Alizada — HAAL-169. Pure function; must pass atoms/time.local_to_utc.v1/vectors.json.
PEP 495 `fold=0` already matches RFC 5545: in a gap it applies the offset before the transition, in an overlap it
picks the first occurrence. Gaps are detected by a round trip, overlaps by comparing fold=0 and fold=1 offsets.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, date, datetime, time, timedelta
from typing import Literal
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

Resolution = Literal["exact", "gap_shifted", "overlap_first"]


class UnknownTimeZoneError(ValueError):
    """tzid is not an IANA time zone (contract error unknown_time_zone)."""


@dataclass(frozen=True, slots=True)
class LocalToUtc:
    utc: datetime
    offset_minutes: int
    resolution: Resolution

    def utc_text(self) -> str:
        return self.utc.strftime("%Y-%m-%dT%H:%M:00Z")


def zone(tzid: str) -> ZoneInfo:
    try:
        return ZoneInfo(tzid)
    except ZoneInfoNotFoundError, ValueError:
        raise UnknownTimeZoneError(tzid) from None


def local_to_utc(local_date: date, local_time: time, tzid: str) -> LocalToUtc:
    tz = zone(tzid)
    first = datetime.combine(local_date, local_time, tzinfo=tz)  # fold=0
    second = first.replace(fold=1)
    offset = first.utcoffset() or timedelta(0)
    instant = (first - offset).replace(tzinfo=UTC)
    if instant.astimezone(tz).replace(tzinfo=None) != first.replace(tzinfo=None):
        resolution: Resolution = "gap_shifted"
    elif (second.utcoffset() or timedelta(0)) != offset:
        resolution = "overlap_first"
    else:
        resolution = "exact"
    return LocalToUtc(utc=instant, offset_minutes=int(offset.total_seconds() // 60), resolution=resolution)
