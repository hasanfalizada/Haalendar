// +++===+++ 2026-10-16 — Hasan Alizada — HAAL-034. Local drafts (D-39): text being edited is kept on this device
// (IndexedDB "haalendar-drafts", separate from the offline store of HAAL-050) until the server has confirmed the save,
// so a lost connection, an expired session, a crashed tab or a reload never loses it. Drafts are per user and are
// wiped on sign-out. Secrets never go into a draft: field names that look like passwords, codes or tokens are refused.
// Storage errors (private mode, quota) are logged and never break the editor.
import { type DBSchema, openDB } from "idb";

import { describeError, log } from "./log";

export type DraftFields = Record<string, string>;

export interface Draft {
  key: string;
  user: string;
  scope: string;
  fields: DraftFields;
  /** ISO time of the last local save. */
  saved_at: string;
}

interface DraftsDb extends DBSchema {
  drafts: { key: string; value: Draft; indexes: { by_user: string } };
}

const DB_NAME = "haalendar-drafts";
const DB_VERSION = 1;

/** Field names (snake_case parts) that may hold secrets; such fields are never stored. */
export const SECRET_FIELD =
  /(^|_)(password|new_password|current_password|passphrase|secret|token|totp|otp|code|recovery|api_key)($|_)/i;

function draftKey(user: string, scope: string): string {
  return `${user}:${scope}`;
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
    log.warn("drafts_storage_unavailable", { error: describeError(error) });
    return null;
  }
}

function open() {
  return openDB<DraftsDb>(DB_NAME, DB_VERSION, {
    upgrade(db) {
      const store = db.createObjectStore("drafts", { keyPath: "key" });
      store.createIndex("by_user", "user");
    },
  });
}

export async function saveDraft(user: string, scope: string, fields: DraftFields): Promise<boolean> {
  const secret = Object.keys(fields).find((name) => SECRET_FIELD.test(name));
  if (secret) {
    log.error("draft_secret_field_refused", { scope, field: secret });
    return false;
  }
  const draft: Draft = { key: draftKey(user, scope), user, scope, fields, saved_at: new Date().toISOString() };
  const done = await withDb(async (db) => {
    await db.put("drafts", draft);
    return true;
  });
  if (done) log.debug("draft_saved", { scope });
  return done ?? false;
}

export async function loadDraft(user: string, scope: string): Promise<Draft | null> {
  return (await withDb((db) => db.get("drafts", draftKey(user, scope)))) ?? null;
}

export async function discardDraft(user: string, scope: string): Promise<void> {
  await withDb((db) => db.delete("drafts", draftKey(user, scope)));
  log.debug("draft_discarded", { scope });
}

export async function countDrafts(user: string): Promise<number> {
  return (await withDb((db) => db.countFromIndex("drafts", "by_user", user))) ?? 0;
}

/** Sign-out: every draft of this user leaves the device (ADR-0005 §8). */
export async function wipeDrafts(user: string): Promise<void> {
  const removed = await withDb(async (db) => {
    const tx = db.transaction("drafts", "readwrite");
    const keys = await tx.store.index("by_user").getAllKeys(user);
    await Promise.all(keys.map((key) => tx.store.delete(key)));
    await tx.done;
    return keys.length;
  });
  log.info("drafts_wiped", { count: removed ?? 0 });
}
