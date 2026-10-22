<!-- +++===+++ 2026-10-22 — Hasan Alizada — HAAL-066. Scenarios for calendar.recurrence.v1 in contract terms. -->

# calendar.recurrence.v1 — examples

1. **Weekly team meeting** — start Thursday 2026-10-22, `FREQ=WEEKLY`, window = this month → every Thursday from the 22nd; the 09:00 start is applied per date afterwards, so it stays 09:00 after the DST change.
2. **Rent on the 31st** — start 2026-01-31, `FREQ=MONTHLY`, window = 2026 → seven dates; February, April, June, September and November are skipped (not moved to the 30th).
3. **Birthday on 29 February** — start 2024-02-29, `FREQ=YEARLY` → nothing in 2025, 2028-02-29 in 2028.
4. **Day view of 22 October** — window 2026-10-22..2026-10-22 → `["2026-10-22"]` when the series occurs that day; an excepted date (deleted occurrence, HAAL-067) is left out.
5. **Unsupported rule** — `FREQ=WEEKLY;BYDAY=MO` → error `UNSUPPORTED_RRULE` (extended rules arrive as a new version in HAAL-092).
