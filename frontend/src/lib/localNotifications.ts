// +++===+++ 2026-10-19 — Hasan Alizada — HAAL-048. Notifications that exist only on this device (FR-X-21, D-52): sync
// errors of the offline outbox (HAAL-052/053) are known here, not on the server. Kept in IndexedDB per user so they
// survive a reload, shown in the notification center next to the server's, and wiped on sign-out like drafts
// (device data, ADR-0005 §8). Listeners hear every change, so an open center updates at once.
import { type DBSchema, openDB } from "idb";

import { describeError, log } from "./log";

export type LocalKind = "sync_error";

export interface LocalNotification {
  id: string;
  user: string;
  kind: LocalKind;
  payload: Record<string, string>;
  created_at: string;
  read_at: string | null;
}

interface LocalDb extends DBSchema {
  notifications: { key: string; value: LocalNotification; indexes: { by_user: string } };
}

const DB_NAME = "haalendar-local-notifications";
const DB_VERSION = 1;
const listeners = new Set<() => void>();

function open() {
  return openDB<LocalDb>(DB_NAME, DB_VERSION, {
    upgrade(db) {
      db.createObjectStore("notifications", { keyPath: "id" }).createIndex("by_user", "user");
    },
  });
}

async function withDb<R>(work: (db: Awaited<ReturnType<typeof open>>) => Promise<R>): Promise<R | null> {
  if (typeof indexedDB === "undefined") return null;
  try {
    const db = await open();
    try {
      return await work(db);
    } finally {
      db.close();
    }
  } catch (error) {
    log.warn("local_notifications_unavailable", { error: describeError(error) });
    return null;
  }
}

function changed(): void {
  for (const listener of listeners) listener();
}

/** Calls `listener` after every change; returns the function that stops it. */
export function subscribeLocalNotifications(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export async function addLocalNotification(
  user: string,
  kind: LocalKind,
  payload: Record<string, string> = {},
): Promise<LocalNotification> {
  const note: LocalNotification = {
    id: crypto.randomUUID(),
    user,
    kind,
    payload,
    created_at: new Date().toISOString(),
    read_at: null,
  };
  await withDb((db) => db.put("notifications", note));
  log.info("local_notification_added", { kind });
  changed();
  return note;
}

/** The user's local notifications, newest first. */
export async function listLocalNotifications(user: string): Promise<LocalNotification[]> {
  const all = (await withDb((db) => db.getAllFromIndex("notifications", "by_user", user))) ?? [];
  return all.sort((a, b) => b.created_at.localeCompare(a.created_at));
}

/** Marks the given (or, without ids, all) unread local notifications read. */
export async function markLocalNotificationsRead(user: string, ids?: readonly string[]): Promise<void> {
  const now = new Date().toISOString();
  await withDb(async (db) => {
    const tx = db.transaction("notifications", "readwrite");
    const notes = await tx.store.index("by_user").getAll(user);
    await Promise.all(
      notes
        .filter((n) => n.read_at === null && (ids === undefined || ids.includes(n.id)))
        .map((n) => tx.store.put({ ...n, read_at: now })),
    );
    await tx.done;
  });
  changed();
}

/** Sign-out: the user's local notifications leave the device. */
export async function wipeLocalNotifications(user: string): Promise<void> {
  const removed = await withDb(async (db) => {
    const tx = db.transaction("notifications", "readwrite");
    const keys = await tx.store.index("by_user").getAllKeys(user);
    await Promise.all(keys.map((key) => tx.store.delete(key)));
    await tx.done;
    return keys.length;
  });
  log.info("local_notifications_wiped", { count: removed ?? 0 });
  changed();
}
