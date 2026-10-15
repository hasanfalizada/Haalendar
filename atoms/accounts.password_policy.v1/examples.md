<!-- +++===+++ 2026-10-15 — Hasan Alizada — HAAL-160. Scenarios for accounts.password_policy.v1 in contract terms. -->

# accounts.password_policy.v1 — examples

1. **Passphrase** — "correct horse battery staple" → valid; no digits or symbols are required.
2. **Too short** — an 11-character "complex" password → `too_short`; length matters more than character classes.
3. **Known password** — "1Q2W3E4R5T6Y7U8I9O0P" (keyboard walk from the common list, any case) → `common`.
4. **Personal data** — password containing the e-mail local part or a name word (4+ characters) → `contains_email` / `contains_name`.
5. **Everything at once** — "aaaa" for aaaa@example.org → `too_short`, `contains_email`, `low_variety` (all reported together).
