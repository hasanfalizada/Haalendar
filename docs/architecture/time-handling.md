# Time handling

+++===+++ 2026-10-15 — Hasan Alizada — HAAL-169. Rules for dates, times and time zones (FR-ACC-11, domain model P7, D-25, D-31).

## 1. What is stored

| Kind | Stored as | Why |
|---|---|---|
| Timed event | `start_date`, `start_time`, `end_date`, `end_time` (wall clock) + `tzid` (IANA zone); `start_utc` / `end_utc` derived | A weekly 09:00 meeting must stay at 09:00 on the wall across DST changes (RFC 5545 DTSTART;TZID). The UTC columns only serve range queries and sorting. |
| All-day event | `start_date`, `end_date` (inclusive), no time; `tzid` kept for reference | A birthday is on 9 May for everybody, in every zone. |
| Technical instants (`created_at`, `last_login_at`, tokens, sessions) | `timestamptz`, always UTC | They are moments, not wall-clock times. |

"Store UTC" in the backlog wording of HAAL-169 means: instants are UTC. Event times follow the model above (owner decision D-31).

## 2. Conversions

- **Local → UTC** — atom `time.local_to_utc.v1` (Python + TypeScript, shared vectors):
  - local time in a DST **gap** (does not exist) → interpreted with the offset before the gap, i.e. it moves forward (`gap_shifted`);
  - local time in a DST **overlap** (exists twice) → the first occurrence (`overlap_first`);
  - otherwise `exact`.
- **Which days an event covers for a viewer** — atom `time.event_days.v1`: all-day events keep their dates; timed events are placed by their UTC instants seen from the viewer's zone; an end exactly at local midnight does not occupy that day.
- Recurring events are converted **per occurrence date** (HAAL-066/092), never by adding fixed 24-hour steps.

## 3. Display

- Everything is shown in the **profile time zone**, not the device's. If the device zone differs (travel), a notice offers "Use <device zone>" (updates the profile) or "Keep <profile zone>" (remembered per device and zone pair).
- New accounts start with the browser's zone (setup, invitation).
- API timestamps are RFC 3339 UTC (`…Z`); database sessions are forced to UTC, so the server's default zone never leaks into responses.

## 4. Time zone data

- Backend: only the pinned PyPI package `tzdata` (currently 2026.5) — host zone files are ignored (`zoneinfo.reset_tzpath([])`). Updating zone rules = bumping `tzdata` and re-running the vectors.
- Web app: the browser's IANA data via `Intl`. Rare differences between browser and server data are possible when a country changes its rules; the server value is authoritative for stored instants.

## 5. Test cases that must always pass

Berlin (gap 29 Mar, overlap 25 Oct), New York, Baku (no DST), Tokyo / Los Angeles (UTC date changes), Lord Howe (half-hour DST), Kolkata (+05:30), Kathmandu (+05:45), leap day — see the vectors of both atoms.
