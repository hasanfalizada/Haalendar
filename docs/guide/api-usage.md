# Calling the Haalendar API from a script

+++===+++ 2026-11-26 — Hasan Alizada — HAAL-153 (D-129). How a script signs in and reads its data; every operation is in
the [API reference](api.md).

The web app is the main client of the API, and works offline: it keeps the data in the browser and exchanges changes
with `/sync` ([ADR-0009](../architecture/adr/ADR-0009-offline-sync.md)). So the content (calendars, events, notes,
boards, cards and what belongs to them) is read with `GET /sync/pull` and changed with `POST /sync/push`; the
operations of the reference marked **Not served by the server** describe the same data and say so. Accounts,
settings, sessions, files, the `.ics` import and export, the trash, exports and administration have their own
operations.

## Sign in

A script signs in like the browser: it gets the session cookie `__Host-haalendar_session` and a CSRF token, and sends
the token as `X-CSRF-Token` on every request that changes something. The cookie is `Secure`, so use the `https://`
address of the installation. Two-factor sign-in adds `"totp_code": "123456"` to the body.

```bash
URL=https://calendar.example.org/api/v1
JAR=$(mktemp)    # the session cookie, kept between the calls
read -r -s -p "Password: " PASSWORD; echo
CSRF=$(jq -n --arg email "you@example.org" --arg password "$PASSWORD" '{email: $email, password: $password}' |
  curl -sf -c "$JAR" -H 'Content-Type: application/json' --data @- "$URL/auth/login" | jq -r .csrf_token)
unset PASSWORD

curl -sf -b "$JAR" "$URL/me" | jq '{email, display_name, time_zone}'
```

## Read the data

The first `GET /sync/pull` without `since` returns everything the account reads, in pages; each answer carries the
`cursor` for the next call, and `has_more` until the last page. Kept, the cursor later returns only what changed since.

```bash
SINCE=""
while :; do
  PAGE=$(curl -sf -b "$JAR" -G "$URL/sync/pull" --data-urlencode "since=$SINCE")
  echo "$PAGE" | jq -c '.changes[] | {entity_type, entity_id, op, title: .data.title}'
  SINCE=$(echo "$PAGE" | jq -r .cursor)
  [ "$(echo "$PAGE" | jq -r .has_more)" = "true" ] || break
done
```

A calendar as an `.ics` file, for another calendar app (its id is in the pulled `calendar` records):

```bash
curl -sf -b "$JAR" -o calendar.ics "$URL/calendars/<calendar id>/export.ics"
```

## Change something

Requests that change data send the token. A change of content goes through `POST /sync/push` as a list of
[mutations](api.md#schema-mutation): each one has its own `mutation_id` (a new UUID, so a repeated request is applied
once), the record and what to do with it, and on an update the `base_version` it was made on and the values it started
from (`base`). Fields changed elsewhere in the meantime are merged when they are other fields; the same field comes
back as `conflict` with the server's state, and nothing is overwritten. Renaming a calendar of version 3, for example:

```bash
MUTATION=$(uuidgen 2>/dev/null || cat /proc/sys/kernel/random/uuid)   # a new UUID
jq -n --arg id "<calendar id>" --arg m "$MUTATION" '{mutations: [{mutation_id: $m, entity_type: "calendar",
  entity_id: $id, op: "update", base_version: 3, base: {name: "Home"}, data: {name: "Family"}}]}' |
  curl -sf -b "$JAR" -H "X-CSRF-Token: $CSRF" -H 'Content-Type: application/json' --data @- "$URL/sync/push" | jq .results
```

Signing out:

```bash
curl -sf -b "$JAR" -H "X-CSRF-Token: $CSRF" -X POST "$URL/auth/logout"
rm -f "$JAR"
```

## Rules worth knowing

- **Errors** are `application/problem+json` (RFC 9457) with a stable `code`, for example `version_conflict` or
  `rate_limited`; the codes are listed under [Problem](api.md#schema-problem).
- **Limits:** a client may send 600 requests a minute (20 for sign-in and password reset); over it the answer is
  `429` with `Retry-After` in seconds. The installation may set other numbers
  ([admin guide](admin/configuration.md#security-and-limits)).
- **Deleting is always soft:** a deleted record keeps its data with `deleted_at` and can be restored from the trash.
- **Times** are UTC (RFC 3339) for timestamps; events keep their local date, time and IANA time zone.
- Interactive API docs are not served by installations; the reference here is written from the same contract.
