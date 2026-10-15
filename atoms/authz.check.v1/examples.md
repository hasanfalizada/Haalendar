<!-- +++===+++ 2026-10-15 — Hasan Alizada — HAAL-165. Scenarios for authz.check.v1 in contract terms. -->

# authz.check.v1 — examples

1. **Own calendar** — Ada opens her calendar, adds an event, renames the calendar and shares it → all allowed (`owner`).
2. **Shared for editing** — Bob has an `edit` share on Ada's calendar → he reads it and edits its events (`shared_edit`), but renaming the calendar or sharing it further is refused with 403 (`owner_only`).
3. **Shared for viewing** — Cid has a `view` share → he reads it (`shared_view`); editing an event is refused with 403 (`view_only`).
4. **Not shared** — Dee guesses the calendar id → every action is refused with **404** (`not_shared`), so she cannot even learn that the calendar exists.
5. **Administrator** — an admin without a share asks for Ada's calendar → 404 like anyone else; the admin role manages accounts, never content.
6. **Revoked share** — after Ada revokes Bob's share, his `share_permission` is `null` → 404 from then on (and the client removes its local copy through sync tombstones).
