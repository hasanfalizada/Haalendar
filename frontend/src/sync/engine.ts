// +++===+++ 2026-10-21 — Hasan Alizada — HAAL-052. The sync engine of one signed-in user (FR-OFF-02/03, ADR-0009, D-57).
// - One tab syncs: the one holding the Web Lock `haalendar-sync-<user>`; the others hear about changes and the status
//   over a BroadcastChannel and ask the leader to sync after their own writes.
// - A run sends the outbox (oldest first, up to 500 per request) and then pulls pages until nothing is left:
//   applied / duplicate → the change leaves the outbox; conflict / rejected → it leaves the outbox and becomes a
//   conflict record with both versions plus a notification on this device (nothing is lost silently).
// - Runs start on sign-in, on reconnect, after a local write, when the tab becomes visible and every 60 s while
//   visible; failures retry with a growing pause (2 s … 5 min); 401 pauses the engine until the same user signs in.
// - Changes that were written offline are announced once they arrive ("N changes synced").
// +++===+++ 2026-10-22 — Hasan Alizada — HAAL-055. Live updates (D-59): the leader keeps one EventSource on /stream.
//   `changes` starts a sync, `notification` refreshes the notification center (in every tab). While the stream is
//   open the 60 s timer does nothing (no polling); when it fails it is opened again with a growing pause (5 s … 5 min)
//   and the timer takes over meanwhile. A paused engine (401) closes it; signing in again opens it.
import { syncPull, syncPush } from "@/api/generated/sdk.gen";
import { addLocalNotification } from "@/lib/localNotifications";
import { describeError, log } from "@/lib/log";
import { notify } from "@/lib/notify";

import { ENTITY_TABLE, type LocalDb, type OutboxEntry, localDb } from "./db";
import { applyServerChanges } from "./local";

export type SyncState = "idle" | "syncing" | "offline" | "error" | "paused";

export interface SyncStatus {
  state: SyncState;
  pending: number;
  conflicts: number;
  lastSyncAt: string | null;
  /** The live stream is open: changes arrive without polling. */
  live: boolean;
}

interface PushResult {
  mutation_id: string;
  status: "applied" | "duplicate" | "conflict" | "rejected";
  version?: number;
  fields?: string[];
  current?: Record<string, unknown>;
  problem?: { code: string; detail?: string };
  edited_elsewhere?: boolean;
}

type Outcome<T> =
  { kind: "ok"; value: T } | { kind: "network" } | { kind: "auth" } | { kind: "gone" } | { kind: "error" };

const BATCH = 500;
const PAGE = 500;
const MAX_PAGES = 100;
const TICK_MS = 60_000;
const DEBOUNCE_MS = 400;
const STREAM_URL = "/api/v1/stream";
const LIVE_RETRY_MS = 5_000;
const LIVE_RETRY_MAX_MS = 300_000;

function wire(entry: OutboxEntry) {
  const { mutation_id, entity_type, entity_id, op, base, base_version, data, client_time } = entry;
  return {
    mutation_id,
    entity_type,
    entity_id,
    op,
    client_time,
    ...(base ? { base } : {}),
    ...(base_version !== undefined ? { base_version } : {}),
    ...(data ? { data } : {}),
  };
}

async function call<T>(request: () => Promise<{ data?: T; response?: Response }>): Promise<Outcome<T>> {
  try {
    const { data, response } = await request();
    if (!response) return { kind: "network" };
    if (response.status === 401) return { kind: "auth" };
    if (response.status === 410) return { kind: "gone" };
    if (!response.ok || data === undefined) return { kind: "error" };
    return { kind: "ok", value: data };
  } catch (error) {
    log.warn("sync_request_failed", { error: describeError(error) });
    return { kind: "network" };
  }
}

export class SyncEngine {
  readonly user: string;
  status: SyncStatus = { state: "idle", pending: 0, conflicts: 0, lastSyncAt: null, live: false };
  private readonly listeners = new Set<() => void>();
  private readonly channel: BroadcastChannel | null;
  private readonly onChanged: () => void;
  private leader = false;
  private running: Promise<void> | null = null;
  private again = false;
  private stopped = false;
  private failures = 0;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private tick: ReturnType<typeof setInterval> | null = null;
  private releaseLock: (() => void) | null = null;
  private readonly onNotification: () => void;
  private source: EventSource | null = null;
  private liveRetry: ReturnType<typeof setTimeout> | null = null;
  private liveFailures = 0;
  private readonly onOnline = () => {
    this.request();
    this.openLive();
  };
  private readonly onVisible = () => {
    if (document.visibilityState === "visible") this.request();
  };

  constructor(user: string, onChanged: () => void, onNotification: () => void = () => undefined) {
    this.user = user;
    this.onChanged = onChanged;
    this.onNotification = onNotification;
    this.channel = typeof BroadcastChannel === "undefined" ? null : new BroadcastChannel(`haalendar-sync-${user}`);
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private setStatus(patch: Partial<SyncStatus>, broadcast = true): void {
    if (this.stopped) return;
    this.status = { ...this.status, ...patch };
    for (const listener of this.listeners) listener();
    if (broadcast && this.leader) this.post({ type: "status", status: this.status });
  }

  /** After stop (sign-out) nothing is sent and the local database is not opened again. */
  private post(message: { type: string; status?: SyncStatus }): void {
    if (!this.stopped) this.channel?.postMessage(message);
  }

  private isStopped(): boolean {
    return this.stopped;
  }

  private async refreshCounts(): Promise<void> {
    if (this.stopped) return;
    try {
      const db = await localDb(this.user);
      const open = await db.conflicts.filter((c) => !c.resolved_at).count();
      this.setStatus({ pending: await db.outbox.count(), conflicts: open });
    } catch (error) {
      // +++===+++ 2026-10-30 — Hasan Alizada — HAAL-140. Stopped meanwhile (sign-out closes the local database): a
      // count still in flight has nothing to report (read through a method: the check above narrowed the field).
      if (this.isStopped()) return;
      log.warn("sync_counts_failed", { error: describeError(error) });
    }
  }

  start(): void {
    if (this.channel) {
      this.channel.onmessage = (event: MessageEvent<{ type: string; status?: SyncStatus }>) => {
        if (event.data.type === "changed") {
          this.onChanged();
          void this.refreshCounts();
        } else if (event.data.type === "notification") {
          this.onNotification();
        } else if (event.data.type === "sync" && this.leader) {
          this.request();
        } else if (event.data.type === "status" && !this.leader && event.data.status) {
          this.setStatus(event.data.status, false);
        }
      };
    }
    window.addEventListener("online", this.onOnline);
    document.addEventListener("visibilitychange", this.onVisible);
    this.tick = setInterval(() => {
      if (document.visibilityState === "visible" && !this.status.live) this.request();
    }, TICK_MS);
    // Not every browser (or test environment) has the Storage API.
    const storage = navigator.storage as StorageManager | undefined;
    void storage?.persist().then((granted) => {
      log.info("storage_persist", { granted });
    });
    void this.refreshCounts();
    const becomeLeader = () => {
      this.leader = true;
      log.info("sync_leader");
      this.request(0);
      this.openLive();
    };
    if (typeof navigator.locks === "undefined") {
      becomeLeader();
    } else {
      void navigator.locks.request(`haalendar-sync-${this.user}`, () => {
        if (this.stopped) return Promise.resolve();
        becomeLeader();
        return new Promise<void>((resolve) => {
          this.releaseLock = resolve;
        });
      });
    }
  }

  stop(): void {
    this.stopped = true;
    if (this.timer) clearTimeout(this.timer);
    if (this.tick) clearInterval(this.tick);
    this.closeLive();
    window.removeEventListener("online", this.onOnline);
    document.removeEventListener("visibilitychange", this.onVisible);
    this.releaseLock?.();
    this.channel?.close();
    this.listeners.clear();
  }

  /** Opens the live stream (leader only, once). */
  openLive(): void {
    if (this.stopped || !this.leader || this.source || typeof EventSource === "undefined") return;
    if (this.liveRetry) clearTimeout(this.liveRetry);
    this.liveRetry = null;
    const source = new EventSource(STREAM_URL);
    this.source = source;
    // No debounce here: the server already merged the burst, and hidden tabs delay timers to about a second.
    source.addEventListener("changes", () => {
      void this.run();
    });
    source.addEventListener("notification", () => {
      this.onNotification();
      this.post({ type: "notification" });
    });
    source.onopen = () => {
      this.liveFailures = 0;
      log.info("live_open");
      this.setStatus({ live: true });
    };
    source.onerror = () => {
      if (this.status.live) {
        this.setStatus({ live: false });
        this.onNotification(); // the notification center polls again until the stream is back
      }
      // CONNECTING: the browser retries by itself; CLOSED (401, 429, server gone): we retry later.
      if (source.readyState === EventSource.CLOSED) {
        this.closeLive();
        this.liveFailures += 1;
        const delay = Math.min(LIVE_RETRY_MAX_MS, LIVE_RETRY_MS * 2 ** (this.liveFailures - 1));
        log.warn("live_closed", { retry_ms: delay });
        if (this.status.state !== "paused") {
          this.liveRetry = setTimeout(() => {
            this.openLive();
          }, delay);
        }
      }
    };
  }

  private closeLive(): void {
    this.source?.close();
    this.source = null;
    if (this.liveRetry) clearTimeout(this.liveRetry);
    this.liveRetry = null;
    if (this.status.live) this.setStatus({ live: false });
  }

  /** Something changed on this device: other tabs re-read, the leader syncs soon. */
  localChange(): void {
    if (this.stopped) return;
    this.onChanged();
    this.post({ type: "changed" });
    void this.refreshCounts();
    this.request();
  }

  request(delay = DEBOUNCE_MS): void {
    if (this.stopped) return;
    if (!this.leader) {
      this.post({ type: "sync" });
      return;
    }
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => void this.run(), delay);
  }

  /** Sync now and wait (sign-out sends what it can first); resolves with what is still unsent. */
  async flush(timeoutMs: number): Promise<number> {
    const done = this.leader ? this.run() : Promise.resolve();
    await Promise.race([done, new Promise((resolve) => setTimeout(resolve, timeoutMs))]);
    const db = await localDb(this.user);
    return db.outbox.count();
  }

  /** One run at a time: a request during a run is answered by one more run right after it. */
  private run(): Promise<void> {
    if (this.stopped) return Promise.resolve();
    if (this.running) {
      this.again = true;
      return this.running;
    }
    if (!navigator.onLine) {
      this.setStatus({ state: "offline" });
      return Promise.resolve();
    }
    this.running = this.runOnce();
    return this.running;
  }

  private async runOnce(): Promise<void> {
    this.setStatus({ state: "syncing" });
    let outcome: "ok" | "network" | "auth" | "error";
    try {
      const db = await localDb(this.user);
      const pushed = await this.push(db);
      outcome = pushed === "ok" ? await this.pull(db) : pushed;
    } catch (error) {
      // The local database failed (quota, closed by sign-out): retried like a server error unless stopped.
      if (!this.stopped) log.warn("sync_local_failed", { error: describeError(error) });
      outcome = "error";
    } finally {
      this.running = null;
    }
    if (this.stopped) return;
    if (outcome === "ok") {
      this.failures = 0;
      this.setStatus({ state: "idle", lastSyncAt: new Date().toISOString() });
    } else if (outcome === "auth") {
      log.info("sync_paused_signed_out");
      this.setStatus({ state: "paused" });
      this.closeLive();
    } else {
      this.failures += 1;
      const delay = Math.min(300_000, 2_000 * 2 ** (this.failures - 1));
      log.warn("sync_failed", { reason: outcome, retry_ms: delay });
      this.setStatus({ state: outcome === "network" ? "offline" : "error" });
      this.request(delay);
    }
    await this.refreshCounts();
    if (this.again) {
      this.again = false;
      this.request();
    }
  }

  private async push(db: LocalDb): Promise<"ok" | "network" | "auth" | "error"> {
    let announced = 0;
    for (;;) {
      const batch = await db.outbox.orderBy("seq").limit(BATCH).toArray();
      if (batch.length === 0 || this.stopped) break;
      await db.outbox.bulkPut(batch.map((entry) => ({ ...entry, sending: true })));
      const outcome = await call(() => syncPush({ body: { mutations: batch.map(wire) } }));
      if (outcome.kind !== "ok") {
        await db.outbox.bulkPut(batch.map((entry) => ({ ...entry, sending: false })));
        return outcome.kind === "gone" ? "error" : outcome.kind;
      }
      const { results: answers } = outcome.value as { results: PushResult[] };
      const results = new Map(answers.map((r) => [r.mutation_id, r]));
      let settled = 0;
      for (const entry of batch) {
        const result = results.get(entry.mutation_id);
        if (!result) continue;
        announced += await this.settle(db, entry, result);
        settled += 1;
      }
      this.localChange();
      // +++===+++ 2026-10-22 — Hasan Alizada — HAAL-054. An answer without results for this batch would send it again
      // and again: the rest waits for the next run (with the retry pause).
      if (settled < batch.length) {
        await db.outbox.bulkPut(
          batch.filter((e) => !results.has(e.mutation_id)).map((e) => ({ ...e, sending: false })),
        );
        log.warn("sync_push_unanswered", { missing: batch.length - settled });
        if (announced > 0) notify.synced(announced);
        return "error";
      }
    }
    if (announced > 0) notify.synced(announced);
    return "ok";
  }

  /** Takes one answered change out of the outbox; returns 1 when an offline change has arrived. */
  private async settle(db: LocalDb, entry: OutboxEntry, result: PushResult): Promise<number> {
    const table = db[ENTITY_TABLE[entry.entity_type]];
    if (entry.seq !== undefined) await db.outbox.delete(entry.seq);
    if (result.status === "applied" || result.status === "duplicate") {
      const row = await table.get(entry.entity_id);
      if (row && result.version !== undefined) await table.put({ ...row, version: result.version });
      // +++===+++ 2026-10-22 — Hasan Alizada — HAAL-054. ADR-0009 rule 4: deleted although changed elsewhere — told.
      if (result.edited_elsewhere) {
        await addLocalNotification(this.user, "sync_error", {
          entity_type: entry.entity_type,
          entity_id: entry.entity_id,
          reason: "deleted_changed",
        });
        log.info("sync_deleted_changed_elsewhere", { entity_type: entry.entity_type });
      }
      return entry.queued_offline ? 1 : 0;
    }
    if (result.current) await table.put(result.current);
    await db.conflicts.put({
      id: entry.mutation_id,
      entity_type: entry.entity_type,
      entity_id: entry.entity_id,
      op: entry.op,
      reason: result.status,
      fields: result.fields ?? Object.keys(entry.data ?? {}),
      mine: entry.data ?? { op: entry.op },
      theirs: result.current ?? null,
      ...(result.problem ? { problem: result.problem } : {}),
      created_at: new Date().toISOString(),
    });
    await addLocalNotification(this.user, "sync_error", {
      entity_type: entry.entity_type,
      entity_id: entry.entity_id,
      reason: result.status,
    });
    log.warn("sync_change_not_applied", { status: result.status, entity_type: entry.entity_type });
    return 0;
  }

  private async pull(db: LocalDb): Promise<"ok" | "network" | "auth" | "error"> {
    let cursor = (await db.meta.get("cursor"))?.value as string | undefined;
    let changed = false;
    for (let page = 0; page < MAX_PAGES; page += 1) {
      const outcome = await call(() => syncPull({ query: { limit: PAGE, ...(cursor ? { since: cursor } : {}) } }));
      if (outcome.kind === "gone") {
        log.warn("sync_cursor_reset");
        await db.meta.delete("cursor");
        cursor = undefined;
        continue;
      }
      if (outcome.kind !== "ok") return outcome.kind;
      if (this.stopped) break;
      const body = outcome.value;
      if (body.changes.length > 0) {
        await applyServerChanges(db, body.changes);
        changed = true;
      }
      cursor = body.cursor;
      await db.meta.put({ key: "cursor", value: cursor });
      if (!body.has_more) break;
    }
    if (changed && !this.stopped) {
      this.onChanged();
      this.post({ type: "changed" });
    }
    return "ok";
  }
}
