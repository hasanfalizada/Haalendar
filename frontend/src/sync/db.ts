// +++===+++ 2026-10-21 — Hasan Alizada — HAAL-052. The local database of one user on this device (FR-OFF-01/02,
// ADR-0009, D-54/D-57): Dexie over IndexedDB, named `haalendar-<user id>`.
// - Entity tables hold the rows as the server sends them (calendars, items, attachment metadata, shares, settings).
// - `outbox` holds the user's changes in order until the server has them; `conflicts` the changes the server could not
//   take as they were; `meta` the sync cursor and bookkeeping.
// - LOCAL_SCHEMA: when the shape of the local rows changes in a way old rows cannot follow, raising it makes the next
//   start empty the entity tables and the cursor (a fresh pull rebuilds them) — the outbox and conflicts are kept.
import Dexie, { type Table } from "dexie";

import { log } from "@/lib/log";

export const LOCAL_SCHEMA = 1;

export type EntityType = "calendar" | "item" | "attachment" | "share" | "settings";
export type MutableEntity = "calendar" | "item";
export type MutationOp = "create" | "update" | "delete" | "restore" | "move";

export type Row = Record<string, unknown> & { version?: number };

export interface OutboxEntry {
  seq?: number;
  mutation_id: string;
  entity_type: MutableEntity;
  entity_id: string;
  op: MutationOp;
  base?: Record<string, unknown>;
  base_version?: number;
  data?: Record<string, unknown>;
  client_time: string;
  /** Written while offline: its arrival is announced ("N changes synced"). */
  queued_offline: boolean;
  /** Part of a push that is under way (never merged into). */
  sending?: boolean;
}

// +++===+++ 2026-10-22 — Hasan Alizada — HAAL-054. A conflict record is the user's text: resolving it never deletes it,
// it is marked resolved (with how) and leaves the device only with the whole local database at sign-out.
export type Resolution = "mine" | "theirs" | "mixed" | "restored" | "discarded" | "dismissed";

export interface ConflictRecord {
  /** The mutation id of the change that could not be applied as it was. */
  id: string;
  entity_type: MutableEntity;
  entity_id: string;
  /** The change that was sent (records from before HAAL-054 have none). */
  op?: MutationOp;
  reason: "conflict" | "rejected";
  fields: string[];
  mine: Record<string, unknown>;
  theirs: Record<string, unknown> | null;
  problem?: { code: string; detail?: string };
  created_at: string;
  resolved_at?: string | null;
  resolution?: Resolution;
}

export interface MetaRow {
  key: string;
  value: unknown;
}

export class LocalDb extends Dexie {
  calendars!: Table<Row, string>;
  items!: Table<Row, string>;
  attachments!: Table<Row, string>;
  shares!: Table<Row, string>;
  settings!: Table<Row, string>;
  outbox!: Table<OutboxEntry, number>;
  conflicts!: Table<ConflictRecord, string>;
  meta!: Table<MetaRow, string>;

  constructor(user: string) {
    super(dbName(user));
    this.version(1).stores({
      calendars: "id, owner_id",
      items: "id, [container_kind+container_id]",
      attachments: "id, item_id, [container_kind+container_id]",
      shares: "id, [container_kind+container_id], grantee_id",
      settings: "owner_id",
      outbox: "++seq, entity_id, mutation_id",
      conflicts: "id, entity_id",
      meta: "key",
    });
  }
}

export const ENTITY_TABLE: Record<EntityType, "calendars" | "items" | "attachments" | "shares" | "settings"> = {
  calendar: "calendars",
  item: "items",
  attachment: "attachments",
  share: "shares",
  settings: "settings",
};

export function dbName(user: string): string {
  return `haalendar-${user}`;
}

// +++===+++ 2026-10-22 — Hasan Alizada — HAAL-060. The open promise is shared, not the bare instance: every caller waits
// until the schema check is done, so a write made right after start can no longer be wiped by the rebuild.
const open = new Map<string, { db: LocalDb; ready: Promise<LocalDb> }>();

async function prepare(db: LocalDb): Promise<LocalDb> {
  const stored = (await db.meta.get("schema"))?.value;
  if (stored !== LOCAL_SCHEMA) {
    await db.transaction("rw", [db.calendars, db.items, db.attachments, db.shares, db.settings, db.meta], async () => {
      await Promise.all([
        db.calendars.clear(),
        db.items.clear(),
        db.attachments.clear(),
        db.shares.clear(),
        db.settings.clear(),
      ]);
      await db.meta.delete("cursor");
      await db.meta.put({ key: "schema", value: LOCAL_SCHEMA });
    });
    if (stored !== undefined) log.info("local_db_rebuilt", { from: JSON.stringify(stored), to: LOCAL_SCHEMA });
  }
  return db;
}

/** The user's local database (one instance per tab), checked against LOCAL_SCHEMA on first use. */
export function localDb(user: string): Promise<LocalDb> {
  const existing = open.get(user);
  if (existing) return existing.ready;
  const db = new LocalDb(user);
  const ready = prepare(db);
  open.set(user, { db, ready });
  return ready;
}

/** Closes and forgets the open databases (tests start each case with an empty IndexedDB). */
export function closeLocalDbs(): void {
  for (const { db } of open.values()) db.close();
  open.clear();
}

/** Sign-out: the user's local database leaves the device (ADR-0005 §8). */
export async function deleteLocalDb(user: string): Promise<void> {
  open.get(user)?.db.close();
  open.delete(user);
  await Dexie.delete(dbName(user));
  log.info("local_db_deleted");
}
