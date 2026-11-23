<!-- +++===+++ 2026-11-18 16:37 +04 — Hasan Alizada — HAAL-185. Scenarios for calendar.day_order.v2 in contract terms. -->

# calendar.day_order.v2 — examples

By time (the default, as version 1):

1. **A usual day** — "Birthday" (all-day), "Dentist" 09:00, "Call" 08:30 → Birthday, Call, Dentist.
2. **A night flight** — "Flight" started yesterday at 22:00 and lands today at 02:00 (`continues`), "Breakfast" 00:00 → Flight, Breakfast.
3. **Same time** — "banana" and "Apple" both at 10:00 → Apple, banana (case does not count).
4. **Colour** — a red and a blue event at the same time with the same title → by creation time, never by colour.

By colour (the legacy order):

5. **Colours** — a yellow, a red, a black, a brown and a blue event → black, blue, red, yellow, brown (the legacy rank: black, purple, green, blue, red, yellow, orange, brown).
6. **Times do not count** — a blue "Dentist" at 09:00 and a black all-day "Zoo trip" → Zoo trip, Dentist.
7. **Same colour** — red "Zoo" at 08:00, red "apple" all-day, red "Meeting" continuing from yesterday → Meeting, Zoo, apple (by the title itself, as the legacy app: capitals before small letters).
