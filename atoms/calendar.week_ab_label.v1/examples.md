<!-- +++===+++ 2026-10-14 — Hasan Alizada — HAAL-014. Scenarios for calendar.week_ab_label.v1 in contract terms. -->

# calendar.week_ab_label.v1 — examples

1. **User marks the current week as A** — anchor = any day of this week → every day of this week returns `A`, next week `B`.
2. **Year boundary in a 53-week year** — anchor in ISO week 53 of 2026 → the first week of 2027 returns `B` (ISO parity would wrongly return the same label).
3. **Dates before the anchor** — one week before → `B` (`weeks_from_anchor = -1`).
4. **User switches week start to Sunday** — weeks are re-cut by the new `week_start`; the label follows the new week boundaries.
5. **Invalid labels** — `["A", "a"]` → error `LABELS_NOT_DISTINCT`.
