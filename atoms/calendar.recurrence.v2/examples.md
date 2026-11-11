<!-- +++===+++ 2026-10-29 — Hasan Alizada — HAAL-092. Scenarios for calendar.recurrence.v2 in contract terms. -->

# calendar.recurrence.v2 — examples

1. **Training twice a week, every other week** — start Thursday 2026-10-22, `FREQ=WEEKLY;INTERVAL=2;BYDAY=TU,TH`, window 2026-10-19..2026-11-22 → 22 October, 3 and 5 November, 17 and 19 November; the Tuesday before the start (20 October) is not an occurrence.
2. **Team review on the last Friday** — start 2026-10-30, `FREQ=MONTHLY;BYDAY=-1FR` → 30 October, 27 November, 25 December, 29 January…; a start on another day is `START_NOT_IN_RULE`.
3. **Rent on the last day of the month** — start 2026-01-31, `FREQ=MONTHLY;BYMONTHDAY=-1` → every month end, 28 February included (compare `FREQ=MONTHLY` from the 31st, which skips the short months).
4. **Ten physiotherapy sessions** — start Monday 2026-10-19, `FREQ=WEEKLY;BYDAY=MO,WE;COUNT=10` → ten dates up to 18 November; deleting one session (an exception) leaves nine, the series does not grow a tenth at the end.
5. **Course until the end of term** — start 2026-10-20, `FREQ=DAILY;UNTIL=20261025` → 20..25 October inclusive.
6. **Outside the subset** — `FREQ=MONTHLY;BYDAY=TH;BYSETPOS=4`, `UNTIL=20261231T235959Z`, `FREQ=DAILY;COUNT=3;UNTIL=20261231` → `UNSUPPORTED_RRULE` (ICS import, HAAL-095, converts what it can into this subset).
