# ADR-0009: Offline-first and synchronisation

+++===+++ 2026-10-21 — Hasan Alizada — HAAL-050. Accepted by owner 2026-10-21; recommended options chosen (decision D-54).
+++===+++ 2026-10-21 — Hasan Alizada — HAAL-053. Amended by owner decision D-56 (section "Amendment HAAL-053").

| Field | Value |
|---|---|
| Status | Accepted |
| Date | 2026-10-21 |
| Decider | Hasan Alizada (owner) |
| Depends on | ADR-0003, ADR-0004, ADR-0005, ADR-0007, domain model v1.0 |
| Implemented by | HAAL-051 (PWA), HAAL-052 (local store + outbox), HAAL-053 (sync API), HAAL-054 (conflicts), HAAL-055 (live updates) |

## Context
- **Requirements:**
  - FR-OFF-01: every item feature works without network after the first sign-in;
  - FR-OFF-02: changes are queued and survive reloads;
  - FR-OFF-03: each change is applied exactly once on reconnect, and the sync status is visible;
  - FR-OFF-04: conflicts never lose data silently and unresolved ones are shown;
  - FR-OFF-05: server-only functions say "requires connection";
  - FR-X-18: changes from other devices appear without per-second polling;
  - SRS 4.1: local operations are reflected in the UI within 100 ms.
- **The server is the authority**, and every write must keep its guarantees:
  - owner/share row-level security (ADR-0005);
  - database-written audit log (D-37);
  - soft delete only (D-34);
  - If-Match versions;
  - Pydantic validation;
  - the `authz.check` atom.
- **Deployment** (ADR-0004): on-premises, two required services (app, PostgreSQL), 2 GB RAM. Every extra service and Postgres logical replication (`wal_level=logical`, replication slots that can retain WAL) is an operational risk for self-hosters.
- **Licence:** Apache-2.0 product for self-hosting; dependencies must be under OSI-approved licences.
- **Already prepared:**
  - client-generated UUIDv7 keys (P1);
  - `version` / `sync_seq` columns (P3);
  - fractional positions (P6);
  - provisional `sync/pull`, `sync/push` and `/stream` endpoints (ADR-0007).

## Options evaluated (npm registry, 2026-10-21)
| Option | Version, licence | How it works | Fit |
|---|---|---|---|
| **Custom outbox + Dexie (IndexedDB)** | dexie 4.4.6, Apache-2.0 | Local database in the browser; outbox of mutations and cursor-based pull against our API | ✅ Every write goes through FastAPI, so RLS, audit, validation and versions apply unchanged; no extra service. Cost: own code for the outbox, the tab leader and conflicts — all under our tests. |
| RxDB core + HTTP replication | rxdb 17.6.0, Apache-2.0 core; some plugins commercial | Local database with a checkpoint pull/push protocol, conflict handler, multi-tab | 🟡 Works against our API without a service, but is a heavy dependency (RxJS) with its own data model over ours; faster storages and several plugins are paid. |
| PowerSync | @powersync/web 2.5.0 (Apache-2.0); service Open Edition under FSL | Postgres → PowerSync service → SQLite in the browser; writes through our API | 🔴 Third service plus logical replication; access rules ("sync rules") duplicate our RLS; the service is source-available, not OSI. |
| ElectricSQL | @electric-sql/client 1.5.28, Apache-2.0 | Read path only: "shapes" streamed from Postgres by the Electric service; writes through our API | 🔴 Third service (Elixir) plus logical replication; shape authorisation through a proxy duplicates RLS; offline writes are still our own code. |
| Replicache / Zero | replicache 15.3.0 (maintenance mode, own terms); @rocicorp/zero 1.11.0, Apache-2.0 | Replicache frozen; Zero runs its own `zero-cache` server replicating Postgres | 🔴 Replicache without development; Zero needs a third service and its own permission model. |
| TanStack DB + offline-transactions | @tanstack/db 0.15.1 (pre-1.0), @tanstack/offline-transactions 1.1.3, MIT | Reactive client collections plus a persisted mutation outbox | 🟡 Close to the chosen design and to TanStack Query, but the core is pre-1.0 with a moving API — revisit when 1.0 ships. |
| Yjs / Automerge (CRDT) | yjs 13.6.33, @automerge/automerge 3.5.0, MIT | Documents that merge automatically | 🔴 The server would store binary documents and could no longer validate, search, apply RLS or audit per field; made for collaborative text, oversized for planning records. |

## Decision
**Custom outbox with Dexie as the local database; the server is our FastAPI through `GET /sync/pull` and `POST /sync/push`.** It is the only option that keeps every server guarantee without duplicating authorisation, adds no service and no logical replication, and uses only OSI-licensed code.

### Server — pull (changes since a cursor)
- One global PostgreSQL sequence `sync_seq_global`. A BEFORE INSERT/UPDATE trigger on every syncable table sets `sync_seq = nextval(...)` (soft deletes and restores are updates, so they get a number too).
- `GET /sync/pull?since=<cursor>&limit=500` returns the rows with `sync_seq > cursor` that the user can read (row-level security of the request), ordered by `sync_seq`, as `Change` objects:
  - `op` `upsert` carries the full resource, including `deleted_at`;
  - `op` `tombstone` is for a container whose share was revoked or left: the client removes the container and everything in it.
- **No change may ever be skipped.** A bare "highest number seen" cursor is not enough: a slow transaction can take a lower number and commit after a row with a higher number has already been handed out. Every syncable row therefore also stores the id of the transaction that wrote it (`sync_xid`, `pg_current_xact_id()`, set by the same trigger). The cursor holds the highest `sync_seq` handed out plus the list of transactions still in progress at that moment (from `pg_current_snapshot()`). The next pull returns rows with `sync_seq` above the cursor **or** written by one of those listed transactions. A slow transaction is thus picked up once it commits, whatever its numbers. HAAL-053 tests this with deliberately interleaved transactions.
- The cursor is opaque to the client: base64url-encoded, with a format version. An unknown or too-old cursor means 410: start over.
- The first sync is the same call without a cursor, paged.

### Server — push (queued mutations)
- `POST /sync/push` takes up to 500 `Mutation`s in client order. Each carries:
  - `mutation_id` (UUIDv7);
  - `entity_type`, `entity_id`, `op` (`create`, `update`, `delete`, `restore`, `move`);
  - `base_version` (the version the client edited; absent on create);
  - `data` (changed fields only for update);
  - `client_time` (informational).
- Each mutation runs through the same service functions as the regular endpoints: authorisation, validation, audit, soft delete. One mutation is one database transaction; a failure does not stop the batch.
- **Exactly once:** applied ids are recorded in the service table `sync_mutation` (owner_id, mutation_id PK, applied_at, result). A repeated id answers `duplicate` with the stored result and changes nothing. Rows are service data and are kept; any later clean-up would be a separate, explicitly listed exception (owner rule on service data).
- **Per-mutation result:**
  - `applied` (new version);
  - `duplicate`;
  - `conflict` (with `current` server state and the conflicting fields);
  - `rejected` (RFC 9457 problem: validation, permission, not found — never retried).

### Conflict policy (field-level merge)
1. **Different fields changed** on two devices: both changes apply. The server accepts an `update` whose `base_version` is older when none of its fields changed since that version; it compares against the audit log's field changes.
2. **The same field changed differently:** the server value stays. The client's value is not dropped: it becomes a **conflict record** (local, with both values) that the user resolves with "keep mine / keep theirs". It is shown in the item and in the notification center (`sync_error` channel, HAAL-048). "Keep mine" is a new mutation on the current version.
3. **Edit of an item deleted elsewhere:** a conflict offering "restore with my changes" (restore + update) or "discard my changes".
4. **Delete of an item edited elsewhere:** the delete applies (soft, restorable from the trash), and the user is told.
5. **Order and sets merge without conflicts:**
   - positions are fractional keys — a collision is re-keyed by the server;
   - recurrence exceptions, labels and assignees are applied as add/remove operations, not as whole lists.
6. **Containers and shares:** losing access turns queued mutations for that container into `rejected` (permission); they are kept as conflict records, so the text is not lost.

Last-write-wins was rejected (it loses data silently, against FR-OFF-04); asking the user about every conflict was rejected (too many questions for disjoint fields).

### Client
- **Store:** Dexie database per user (`haalendar-<user id>`) with tables per entity, the outbox, conflict records and sync state (cursor, last success).
- **Reads:** UI reads go through TanStack Query, whose query functions read Dexie. Writes apply to Dexie at once and enter the outbox in the same Dexie transaction (≤ 100 ms), then the sync loop sends them; `runWrite` reports "queued" / "synced" (D-39).
- **One tab syncs:** the tab holding a Web Lock (`navigator.locks`) is the leader; it alone pulls and pushes. Other tabs learn about changes through BroadcastChannel and re-read Dexie. If the leader closes, another tab takes the lock.
- **Triggers:** start, reconnect (`online`), a local write (debounced), the SSE `changes` event (HAAL-055), and a fallback timer while visible. Retries back off exponentially; a 401 pauses the outbox until the same user signs in again (ADR-0005 §8).
- **Status:** online / offline / syncing / error, shown in the existing connection indicator.
- **Sign-out:** sync first (warning when offline or failing), then the user's Dexie database, drafts, local notifications and caches are deleted.
- **Local schema changes:** Dexie versions. An incompatible change rebuilds the local data from a fresh pull and keeps the outbox.
- **Offline search** (HAAL-039) indexes the Dexie data.

### Security
- Data on the device is not encrypted (IndexedDB has no encryption at rest; a key held in the same browser would not protect it). This is an accepted risk:
  - the device is protected by its own lock screen and disk encryption;
  - sign-out wipes the data;
  - administrators can revoke sessions (the outbox then waits for a new sign-in).
- Pull never returns rows outside the user's RLS view. Push re-checks every mutation on the server: the client is never trusted for permissions or validation.
- Mutation payloads are validated by the same Pydantic schemas as the regular endpoints; unknown fields are rejected.

## Amendment HAAL-053 (D-56)
+++===+++ 2026-10-21 — Hasan Alizada — HAAL-053.
- **Conflict detection uses base values, not the audit log.** An `update` / `move` mutation carries `base`: the value of every changed field as the client last saw it. The server compares the current value with it: equal → the new value applies; already equal to the new value → nothing to do; otherwise → conflict on that field (server value stays, reported in `fields` with `current`). It is an exact three-way merge per field and does not depend on the audit log's format.
- **High-water mark.** The last page of a pull moves the cursor to the highest committed `sync_seq` over all synced tables (SECURITY DEFINER function `haalendar_sync_high_water()`, a number only, evaluated in the same snapshot). Otherwise a user who can see nothing keeps an old cursor and receives everything twice once a container is shared with them; the content sent along with a new share is de-duplicated against the batch as well.
- **Stamp order.** The trigger takes the transaction id before the sequence number, so a transaction holding a number is always listed as in progress in a snapshot taken before it commits.
- **Scope today:** pull sends calendars, shares, items (shared fields), attachment metadata and settings; push accepts calendar create / update / delete / restore and item update / move / delete / restore. Item creation arrives with the modules; attachments, shares and settings stay online-only.

## Consequences
- **No new services, no logical replication, no new server dependency.** Client additions: `dexie` (Apache-2.0) in HAAL-052.
- Own code needs thorough tests: unit tests of the outbox and merge rules, API tests of pull/push (cursor gaps, duplicates, conflicts, permissions) and the offline E2E suite of HAAL-142 (network cut, reload offline, concurrent edits).
- The contract `api/modules/sync.yaml` is no longer provisional in meaning; the endpoints become implemented in HAAL-053.
- The domain model gains the global sequence and `sync_xid` on syncable tables, `sync_mutation` (service data, section 5.17a) and client-side conflict records.
- TanStack DB is re-evaluated once it reaches 1.0: the outbox and Dexie layout are kept compatible with a later move.

## References
[PowerSync licensing](https://powersync.com/legal/licensing-terms), [PowerSync self-hosting](https://docs.powersync.com/intro/self-hosting), [ElectricSQL 1.0](https://electric.ax/blog/2025/03/17/electricsql-1.0-released.md), [Electric shapes](https://electric-sql.com/docs/guides/shapes), [RxDB premium](https://rxdb.info/premium/), [Replicache](https://replicache.dev/), [@tanstack/offline-transactions](https://unpkg.com/@tanstack/offline-transactions@1.0.56/README.md), [Dexie releases](https://github.com/dexie/Dexie.js/releases).

## Amendment HAAL-054 (D-58)
+++===+++ 2026-10-22 — Hasan Alizada — HAAL-054.
- **Where conflicts are resolved:** Settings → Sync (`#sync`), reached from the connection indicator, the notification center and the user menu; a record with an open conflict shows a notice leading there.
- **Rule 3 on the wire:** "deleted elsewhere" arrives as `rejected` with problem `invalid_state` and `current` (the deleted server row); the client offers restore with my changes or discard.
- **Rule 4 on the wire:** a `delete` carrying `base_version` applies even when the record changed since; the result then says `edited_elsewhere: true` and the client shows a notification leading to the trash.
- **Resolved conflict records are kept** (marked `resolved_at`, `resolution`) — they hold the user's text; they leave the device with the local database at sign-out.

## Amendment HAAL-055 (D-59)
+++===+++ 2026-10-22 — Hasan Alizada — HAAL-055.
- **Transport:** SSE `GET /stream` (sse-starlette), session cookie, `retry: 5000`, `X-Accel-Buffering: no`. Events carry no data (`changes`, `notification`, `ping` every 25 s); the client pulls with its cursor, so row-level security stays the only read gate and `Last-Event-ID` is not needed — the first event is always `changes`.
- **Bus:** PostgreSQL LISTEN/NOTIFY on channel `haalendar_sync`. An AFTER trigger on the synced tables and `notification` names a container and/or users; messages arrive only for committed transactions (also from the worker), identical messages of one transaction are merged. Each API process keeps one listening connection; after it reconnects every open stream gets `changes`.
- **Audience:** `haalendar_sync_audience(kind, id)` (SECURITY DEFINER, ids only) — owner and current grantees; a share change also names grantee and granter directly (a revoked share reaches the person who lost access).
- **Sessions:** checked at every ping without sliding the idle expiry (an open tab is not activity); a revoked or expired session ends the stream. At most 10 streams per user and 1000 per process (429). Gauge `haalendar_sse_connections`.
- **Client:** only the syncing tab holds the stream; while it is open the 60 s sync timer and the notification polling stop; a stream refused or lost is opened again after 5 s … 5 min, polling covers the gap.

