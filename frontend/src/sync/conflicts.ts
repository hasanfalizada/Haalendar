// +++===+++ 2026-10-22 — Hasan Alizada — HAAL-054. Resolving sync conflicts (FR-OFF-04, ADR-0009 rules 2, 3, 6):
// - "fields": the same field was changed here and elsewhere — per field keep mine (a new update on the current server
//   version, its values as the base: if the field moves again meanwhile, that is a new conflict, never a silent loss)
//   or keep theirs;
// - "deleted": changed here, deleted elsewhere — restore with my changes (restore + update) or discard my changes;
// - "rejected": refused for another reason (no access any more, invalid, not found) — my values stay readable and can
//   be copied, then dismissed.
// A resolved record is only marked (resolved_at, resolution), never deleted: it is the user's text.
import { useQuery } from "@tanstack/react-query";

import { log } from "@/lib/log";

import type { ConflictRecord, Resolution, Row } from "./db";
import { localDb } from "./db";
import { localChanged, localKeys, mutate } from "./index";

export type ConflictKind = "fields" | "deleted" | "rejected";

export function conflictKind(conflict: ConflictRecord): ConflictKind {
  if (conflict.reason === "conflict") return "fields";
  if (conflict.problem?.code === "invalid_state" && conflict.theirs?.deleted_at) return "deleted";
  return "rejected";
}

/** The fields to show: the conflicting ones, or everything the change carried. */
export function shownFields(conflict: ConflictRecord): string[] {
  const carried = Object.keys(conflict.mine).filter((name) => name !== "op");
  return conflictKind(conflict) === "fields" ? conflict.fields : carried;
}

/** The name of the record as the server or this device knows it. */
export function recordName(conflict: ConflictRecord): string {
  const source = { ...conflict.mine, ...(conflict.theirs ?? {}) };
  // +++===+++ 2026-10-29 — Hasan Alizada — HAAL-101. A checklist item is named by its text.
  const name = source.title ?? source.name ?? source.text;
  return typeof name === "string" ? name : "";
}

export function conflictsQuery(user: string | undefined) {
  return {
    queryKey: localKeys.conflicts(user ?? ""),
    queryFn: async (): Promise<ConflictRecord[]> => {
      if (!user) return [];
      const db = await localDb(user);
      const open = await db.conflicts.filter((c) => !c.resolved_at).toArray();
      return open.sort((a, b) => a.created_at.localeCompare(b.created_at));
    },
  };
}

/** The open conflicts of the user (optionally of one record). */
export function useConflicts(user: string | undefined, entityId?: string): ConflictRecord[] {
  const { data = [] } = useQuery(conflictsQuery(user));
  return entityId ? data.filter((c) => c.entity_id === entityId) : data;
}

async function mark(user: string, conflict: ConflictRecord, resolution: Resolution): Promise<void> {
  const db = await localDb(user);
  await db.conflicts.update(conflict.id, { resolved_at: new Date().toISOString(), resolution });
  log.info("sync_conflict_resolved", { entity_type: conflict.entity_type, resolution });
  localChanged(user);
}

async function currentRow(user: string, conflict: ConflictRecord): Promise<Row | undefined> {
  const db = await localDb(user);
  return db[conflict.entity_type === "calendar" ? "calendars" : "items"].get(conflict.entity_id);
}

/** Rule 2: per field "mine" or "theirs"; the fields kept as mine are sent again on the current version. */
export async function resolveFields(
  user: string,
  conflict: ConflictRecord,
  choice: Record<string, "mine" | "theirs">,
): Promise<{ data: Resolution }> {
  const mine = conflict.fields.filter((name) => choice[name] === "mine");
  if (mine.length > 0) {
    const row = (await currentRow(user, conflict)) ?? conflict.theirs ?? {};
    await mutate(user, {
      entity_type: conflict.entity_type,
      entity_id: conflict.entity_id,
      op: "update",
      ...(typeof row.version === "number" ? { base_version: row.version } : {}),
      base: Object.fromEntries(mine.map((name) => [name, row[name] ?? null])),
      data: Object.fromEntries(mine.map((name) => [name, conflict.mine[name] ?? null])),
    });
  }
  const resolution: Resolution =
    mine.length === conflict.fields.length ? "mine" : mine.length === 0 ? "theirs" : "mixed";
  await mark(user, conflict, resolution);
  return { data: resolution };
}

/** Rule 3: bring the record back and lay my changes over it. */
export async function restoreWithMine(user: string, conflict: ConflictRecord): Promise<{ data: Resolution }> {
  const row = (await currentRow(user, conflict)) ?? conflict.theirs ?? {};
  const target = { entity_type: conflict.entity_type, entity_id: conflict.entity_id };
  await mutate(user, {
    ...target,
    op: "restore",
    ...(typeof row.version === "number" ? { base_version: row.version } : {}),
  });
  const fields = shownFields(conflict);
  if (conflict.op === "move") {
    await mutate(user, { ...target, op: "move", base: {}, data: conflict.mine });
  } else if (fields.length > 0 && conflict.op !== "delete" && conflict.op !== "restore") {
    await mutate(user, {
      ...target,
      op: "update",
      base: Object.fromEntries(fields.map((name) => [name, row[name] ?? null])),
      data: Object.fromEntries(fields.map((name) => [name, conflict.mine[name] ?? null])),
    });
  }
  await mark(user, conflict, "restored");
  return { data: "restored" };
}

/** Rules 3 and 6: the user lets the change go (the record stays on this device, marked). */
export async function letGo(user: string, conflict: ConflictRecord): Promise<{ data: Resolution }> {
  const resolution: Resolution = conflictKind(conflict) === "deleted" ? "discarded" : "dismissed";
  await mark(user, conflict, resolution);
  return { data: resolution };
}
