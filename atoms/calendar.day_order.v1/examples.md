<!-- +++===+++ 2026-10-22 — Hasan Alizada — HAAL-060. Scenarios for calendar.day_order.v1 in contract terms. -->

# calendar.day_order.v1 — examples

1. **A usual day** — "Birthday" (all-day), "Dentist" 09:00, "Call" 08:30 → Birthday, Call, Dentist.
2. **A night flight** — "Flight" started yesterday at 22:00 and lands today at 02:00 (`continues`), "Breakfast" 00:00 → Flight, Breakfast.
3. **Same time** — "banana" and "Apple" both at 10:00 → Apple, banana (case does not count).
4. **Accents** — "Éclair" and "Eagle" at 10:00 → Eagle, Éclair (accents do not count).
5. **Colour** — a red and a blue event at the same time with the same title → by creation time, never by colour (the legacy order).
