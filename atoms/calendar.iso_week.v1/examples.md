<!-- +++===+++ 2026-10-23 — Hasan Alizada — HAAL-062. Scenarios for calendar.iso_week.v1 in contract terms. -->

# calendar.iso_week.v1 — examples

1. **The selected day, not today** — today 2026-10-23 (week 43), the user selects 2026-12-31 → week 53 of 2026 (the legacy app kept showing 43).
2. **New Year in week 53** — 2027-01-01 → week 53, week year 2026 (the header says "Week 53 · 2026").
3. **Late December in week 1** — 2024-12-30 → week 1, week year 2025.
4. **First days of January in the old year** — 2021-01-03 (a Sunday) → week 53 of 2020.
5. **User week start does not matter** — a Sunday-first calendar still shows ISO weeks (Monday-based), as ISO 8601 defines.
