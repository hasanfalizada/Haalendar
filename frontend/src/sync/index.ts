// +++===+++ 2026-10-21 — Hasan Alizada — HAAL-052. The offline store for the UI (FR-OFF-01/02, ADR-0009, D-57):
// - startSync / stopSync: one engine per signed-in user (the shell starts it once the profile is known);
// - mutate: the only way content (calendars, items) is changed — written to the local database and the outbox in one
//   transaction and synced in the background; shaped like a call of the generated client so it runs through runWrite
//   ("Saved" online, "Saved on this device…" offline, "N changes synced" when offline changes arrive);
// - localKeys / localRows: TanStack Query reads the local tables; every local or synced change invalidates them;
// - useSyncStatus: what the status indicator and the offline banner show;
// - prepareSignOut: sends what it can, then says how many changes would be lost.
import type { QueryClient } from "@tanstack/react-query";
import { useSyncExternalStore } from "react";

import { log } from "@/lib/log";

import { ENTITY_TABLE, type EntityType, type OutboxEntry, type Row, deleteLocalDb, localDb } from "./db";
import { SyncEngine, type SyncStatus } from "./engine";
import { type NewMutation, enqueue } from "./outbox";

export type { NewMutation } from "./outbox";
export type { SyncStatus } from "./engine";

export const localKeys = {
  all: ["local"] as const,
  table: (entity: EntityType) => ["local", entity] as const,
  // +++===+++ 2026-10-22 — Hasan Alizada — HAAL-054. Open conflicts of a user.
  conflicts: (user: string) => ["local", "conflicts", user] as const,
};

let engine: SyncEngine | null = null;

export function startSync(user: string, queryClient: QueryClient): void {
  if (engine?.user === user) {
    // The same user again (e.g. signed in after the session expired): a paused engine resumes.
    engine.request(0);
    engine.openLive();
    return;
  }
  engine?.stop();
  engine = new SyncEngine(
    user,
    () => {
      void queryClient.invalidateQueries({ queryKey: localKeys.all });
    },
    // +++===+++ 2026-10-22 — Hasan Alizada — HAAL-055. A notification arrived live (or the stream dropped).
    () => {
      void queryClient.invalidateQueries({ queryKey: ["session", "notifications"] });
    },
  );
  engine.subscribe(notifyStatus);
  engine.start();
  notifyStatus();
}

export function stopSync(): void {
  engine?.stop();
  engine = null;
  notifyStatus();
}

/** The result of a local write: `queued` when it was written without a connection. */
export interface LocalWrite {
  entry: OutboxEntry;
  queued: boolean;
}

export function isQueuedWrite(value: unknown): boolean {
  return typeof value === "object" && value !== null && "entry" in value && (value as LocalWrite).queued;
}

/** Something changed in the local database without a mutation (a conflict resolved): views and counts refresh. */
export function localChanged(user: string): void {
  if (engine?.user === user) engine.localChange();
}

/** Sync now (the "Sync now" button); a paused engine tries again. */
export function syncNow(): void {
  engine?.request(0);
}

/** A content change of the user, for runWrite({ run: () => mutate(user, change), … }). */
export async function mutate(user: string, change: NewMutation): Promise<{ data: LocalWrite }> {
  const offline = !navigator.onLine || engine?.status.state === "offline";
  const db = await localDb(user);
  const entry = await enqueue(db, change, offline);
  log.info("local_change_queued", { entity_type: change.entity_type, op: change.op, offline });
  if (engine?.user === user) engine.localChange();
  return { data: { entry, queued: offline } };
}

/** All rows of one local table (callers filter; the UI of each module builds its own views on top). */
export async function localRows(user: string, entity: EntityType): Promise<Row[]> {
  const db = await localDb(user);
  return db[ENTITY_TABLE[entity]].toArray();
}

const IDLE: SyncStatus = { state: "idle", pending: 0, conflicts: 0, lastSyncAt: null, live: false };
const statusListeners = new Set<() => void>();

function notifyStatus(): void {
  for (const listener of statusListeners) listener();
}

function subscribeStatus(listener: () => void): () => void {
  statusListeners.add(listener);
  return () => {
    statusListeners.delete(listener);
  };
}

export function syncStatus(): SyncStatus {
  return engine?.status ?? IDLE;
}

export function useSyncStatus(): SyncStatus {
  return useSyncExternalStore(subscribeStatus, syncStatus);
}

/** Before sign-out: sync for up to `timeoutMs`; returns how many changes are still only on this device. */
export async function prepareSignOut(user: string, timeoutMs = 5_000): Promise<number> {
  if (engine?.user === user) return engine.flush(timeoutMs);
  const db = await localDb(user);
  return db.outbox.count();
}

/** Sign-out: the engine stops and the user's local database leaves the device. */
export async function wipeLocalStore(user: string): Promise<void> {
  if (engine?.user === user) stopSync();
  await deleteLocalDb(user);
}
