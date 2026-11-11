// +++===+++ 2026-10-21 — Hasan Alizada — HAAL-051. The last signed-in profile on this device (FR-OFF-01, D-55), so the
// app starts without network after a sign-in: name, e-mail, time zone, role, avatar URL — never the CSRF token (it
// belongs to the live session and stays in memory, ADR-0005). Written after every successful GET /me, read only when
// the server cannot be reached, deleted on sign-out. Storage failures never break the app.
import { type DBSchema, openDB } from "idb";

import type { Me } from "@/api/generated/types.gen";

import { describeError, log } from "./log";

interface ProfileDb extends DBSchema {
  profile: { key: string; value: Me };
}

const DB_NAME = "haalendar-profile";
const KEY = "last";

function open() {
  return openDB<ProfileDb>(DB_NAME, 1, {
    upgrade(db) {
      db.createObjectStore("profile");
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
    log.warn("profile_cache_unavailable", { error: describeError(error) });
    return null;
  }
}

export async function rememberProfile(me: Me): Promise<void> {
  const profile: Me = { ...me };
  delete profile.csrf_token; // the session token never leaves memory
  await withDb((db) => db.put("profile", profile, KEY));
}

export async function cachedProfile(): Promise<Me | null> {
  return (await withDb((db) => db.get("profile", KEY))) ?? null;
}

export async function forgetProfile(): Promise<void> {
  await withDb((db) => db.delete("profile", KEY));
  log.info("profile_cache_cleared");
}
