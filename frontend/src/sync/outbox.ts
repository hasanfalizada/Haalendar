// +++===+++ 2026-10-21 — Hasan Alizada — HAAL-052. The outbox (FR-OFF-02, ADR-0009, D-57): a change and its local
// effect are written in one Dexie transaction, so the UI shows it at once (≤ 100 ms) and it survives a reload, a crash
// or a closed browser. Until a change is being sent, later edits of the same record merge into it:
// - update after update: newest values per field, the base values of the first edit (what the server last had);
// - update after create: folded into the create (the server has never seen the record);
// - restore right after delete (or the reverse): both go, nothing to send.
// +++===+++ 2026-10-23 — Hasan Alizada — HAAL-067. - include right after exclude of the same date (or the reverse): the
//   same, both go.
// Merging is per record and never touches a change already on its way.
import { uuidv7 } from "@/lib/uuid";

import type { LocalDb, MutableEntity, MutationOp, OutboxEntry } from "./db";
import { applyLocal } from "./local";

export interface NewMutation {
  entity_type: MutableEntity;
  entity_id: string;
  op: MutationOp;
  base?: Record<string, unknown>;
  base_version?: number;
  data?: Record<string, unknown>;
}

function merged(previous: OutboxEntry, next: NewMutation): OutboxEntry | "cancel" | null {
  if (next.op === "update" && (previous.op === "update" || previous.op === "create")) {
    return {
      ...previous,
      data: { ...(previous.data ?? {}), ...(next.data ?? {}) },
      base: previous.op === "create" ? undefined : { ...(next.base ?? {}), ...(previous.base ?? {}) },
    };
  }
  const sameDate = previous.data?.occurrence_date === next.data?.occurrence_date;
  const opposite =
    (previous.op === "delete" && next.op === "restore") ||
    (previous.op === "restore" && next.op === "delete") ||
    (sameDate && previous.op === "exclude" && next.op === "include") ||
    (sameDate && previous.op === "include" && next.op === "exclude");
  return opposite ? "cancel" : null;
}

/** Records a change of the user and applies it locally; returns the outbox entry. */
export async function enqueue(db: LocalDb, change: NewMutation, offline: boolean): Promise<OutboxEntry> {
  return db.transaction("rw", [db.outbox, db.calendars, db.items, db.attachments, db.shares, db.settings], async () => {
    const pending = await db.outbox.where("entity_id").equals(change.entity_id).sortBy("seq");
    const last = pending.at(-1);
    const entry: OutboxEntry = {
      mutation_id: uuidv7(),
      ...change,
      client_time: new Date().toISOString(),
      queued_offline: offline,
    };
    const folded = last && !last.sending ? merged(last, change) : null;
    if (folded === "cancel") {
      if (last?.seq !== undefined) await db.outbox.delete(last.seq);
    } else if (folded && last?.seq !== undefined) {
      await db.outbox.put({ ...folded, queued_offline: last.queued_offline || offline });
    } else {
      await db.outbox.add(entry);
    }
    await applyLocal(db, entry);
    return entry;
  });
}

export async function pendingCount(db: LocalDb): Promise<number> {
  return db.outbox.count();
}
