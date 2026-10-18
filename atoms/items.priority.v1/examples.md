<!-- +++===+++ 2026-10-17 — Hasan Alizada — HAAL-041. Scenarios for items.priority.v1 in contract terms. -->

# items.priority.v1 — examples

1. **New card** — Ada creates a card without choosing a priority → it is `medium` (normalize of a missing value).
2. **Board sorted by priority** — the column shows high cards first, then medium, then low; inside one priority the cards keep their manual order (tiebreak = position).
3. **Day view** — two high events on one day are ordered by start time (tiebreak = start), above the medium ones.
4. **Filter "High + Medium"** — low notes disappear, the rest keep their order; clearing the filter (empty set) shows everything again.
5. **Imported legacy event without priority** — counts as medium everywhere: in sorting, in filters and on screen.
