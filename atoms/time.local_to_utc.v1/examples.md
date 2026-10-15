<!-- +++===+++ 2026-10-15 — Hasan Alizada — HAAL-169. Scenarios for time.local_to_utc.v1 in contract terms. -->

# time.local_to_utc.v1 — examples

1. **Ordinary meeting** — 09:30 in Berlin on 15 January → 08:30 UTC (`exact`, +60); in July → 07:30 UTC (+120).
2. **Clock jumps forward** — 02:30 on 29 March 2026 does not exist in Berlin → treated with the winter offset → 01:30 UTC, which is 03:30 on the wall (`gap_shifted`).
3. **Clock jumps back** — 02:30 on 25 October 2026 happens twice in Berlin → the first one, 00:30 UTC (`overlap_first`).
4. **Unusual offsets** — Kolkata +05:30, Kathmandu +05:45 and Lord Howe's half-hour DST work like any other zone.
5. **Recurring events** — a weekly 09:00 meeting is converted per occurrence date, so it stays at 09:00 on the wall across DST changes (the UTC instant moves).
