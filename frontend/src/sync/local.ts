// +++===+++ 2026-10-21 — Hasan Alizada — HAAL-052. How changes look on this device (ADR-0009, D-57):
// - applyLocal: the immediate effect of the user's own change on the local rows (so the UI shows it at once);
// - applyServerChanges: rows from a pull (upsert) and tombstones (a container no longer readable: it and everything in
//   it leave the device); afterwards the changes still waiting in the outbox are laid over again, so a pull never
//   hides an edit the server has not received yet.
// +++===+++ 2026-10-23 — Hasan Alizada — HAAL-067. exclude / include change the excluded dates of a series at once.
import type { Change } from "@/api/generated/types.gen";

import { ENTITY_TABLE, type EntityType, type LocalDb, type OutboxEntry } from "./db";

function now(): string {
  return new Date().toISOString();
}

/** The local effect of one change of the user (inside the caller's transaction). */
export async function applyLocal(db: LocalDb, entry: OutboxEntry): Promise<void> {
  const table = db[ENTITY_TABLE[entry.entity_type]];
  const row = await table.get(entry.entity_id);
  switch (entry.op) {
    case "create":
      await table.put({ ...(entry.data ?? {}), id: entry.entity_id, version: 0, deleted_at: null });
      return;
    case "update":
    case "move":
      if (row) await table.put({ ...row, ...(entry.data ?? {}) });
      return;
    case "delete":
      if (row && !row.deleted_at) await table.put({ ...row, deleted_at: now() });
      return;
    case "restore":
      if (row) await table.put({ ...row, deleted_at: null });
      return;
    case "exclude":
    case "include": {
      const day = entry.data?.occurrence_date;
      if (!row || typeof day !== "string") return;
      const others = (Array.isArray(row.exceptions) ? (row.exceptions as unknown[]) : []).filter((d) => d !== day);
      const exceptions = entry.op === "exclude" ? [...others, day].map(String).sort() : others;
      await table.put({ ...row, exceptions });
      return;
    }
  }
}

async function removeContainer(db: LocalDb, kind: string, id: string): Promise<void> {
  const inside = [kind, id] as [string, string];
  await db.items.where("[container_kind+container_id]").equals(inside).delete();
  await db.attachments.where("[container_kind+container_id]").equals(inside).delete();
  await db.shares.where("[container_kind+container_id]").equals(inside).delete();
  if (kind === "calendar") await db.calendars.delete(id);
}

/** Applies a page of server changes, then lays the waiting local changes over them again. */
export async function applyServerChanges(db: LocalDb, changes: Change[]): Promise<void> {
  await db.transaction("rw", [db.calendars, db.items, db.attachments, db.shares, db.settings, db.outbox], async () => {
    for (const change of changes) {
      if (change.op === "tombstone") {
        await removeContainer(db, change.entity_type, change.entity_id);
        continue;
      }
      // +++===+++ 2026-10-21 — Hasan Alizada — kinds this client does not keep yet (boards, notes) are skipped.
      const name = ENTITY_TABLE[change.entity_type as EntityType] as (typeof ENTITY_TABLE)[EntityType] | undefined;
      if (name && change.data) await db[name].put(change.data);
    }
    const waiting = await db.outbox.orderBy("seq").toArray();
    for (const entry of waiting) await applyLocal(db, entry);
  });
}
