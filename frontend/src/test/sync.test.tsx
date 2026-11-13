// +++===+++ 2026-10-21 — Hasan Alizada — HAAL-052. Local store and outbox (FR-OFF-01/02/03, ADR-0009, D-57): changes
// are written locally and to the outbox in one step, later edits of the same record merge, pulled rows never hide an
// unsent edit, tombstones remove a container with its content, the engine sends the outbox and pulls until done,
// conflicts and rejections are kept with both versions and a notification, 410 starts over, 401 pauses, offline writes
// say "saved on this device" and are announced when they arrive, sign-out names the unsent changes and deletes the
// local database.
import { QueryClient, QueryObserver } from "@tanstack/react-query";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import Dexie from "dexie";
import { afterEach, describe, expect, it, vi } from "vitest";

import { setCsrfToken } from "@/api/client";
import type { Settings } from "@/api/generated/types.gen";
import { settingsQuery, settingsQueryKey } from "@/api/settings";
import { isDeviceProfile, meQuery } from "@/api/session";
import { runWrite } from "@/api/write";
import { createCalendar, deleteCalendar } from "@/components/calendar/calendarWrites";
import { listLocalNotifications } from "@/lib/localNotifications";
import { forgetProfile, rememberProfile } from "@/lib/profileCache";
import { localChanged, mutate, prepareSignOut, startSync, syncStatus } from "@/sync";
import { dbName, localDb } from "@/sync/db";
import { applyServerChanges, removeRowsNotOnServer } from "@/sync/local";
import { enqueue } from "@/sync/outbox";

import { type Call, json, me, noContent, problem, renderApp, settings, stubApi } from "./fake-api";

const USER = me().id;
const CAL = "0199f000-0000-7000-8000-0000000000c1";
const ITEM = "0199f000-0000-7000-8000-0000000000e1";
const OTHER = "0199f000-0000-7000-8000-0000000000c2";

function setOnline(online: boolean): void {
  vi.spyOn(navigator, "onLine", "get").mockReturnValue(online);
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("outbox", () => {
  it("applies a change locally and merges later edits of the same record", async () => {
    const db = await localDb(USER);
    await enqueue(db, { entity_type: "calendar", entity_id: CAL, op: "create", data: { name: "Work" } }, false);
    expect(await db.calendars.get(CAL)).toMatchObject({ id: CAL, name: "Work", version: 0, deleted_at: null });
    await enqueue(db, { entity_type: "calendar", entity_id: CAL, op: "update", data: { color: "#00f" } }, true);
    const [created] = await db.outbox.toArray();
    expect(await db.outbox.count()).toBe(1);
    // Folded into the create (the server has never seen the record); an offline part makes the whole one offline.
    expect(created).toMatchObject({ op: "create", data: { name: "Work", color: "#00f" }, queued_offline: true });
    expect(created?.base).toBeUndefined();
  });

  it("keeps the first base of consecutive updates and newest values", async () => {
    const db = await localDb(USER);
    await db.items.put({ id: ITEM, title: "A", notes: "x", version: 3, deleted_at: null });
    const update = (data: Record<string, unknown>, base: Record<string, unknown>) =>
      enqueue(db, { entity_type: "item", entity_id: ITEM, op: "update", base_version: 3, base, data }, false);
    await update({ title: "B" }, { title: "A" });
    await update({ title: "C", notes: "y" }, { title: "B", notes: "x" });
    const entries = await db.outbox.toArray();
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ data: { title: "C", notes: "y" }, base: { title: "A", notes: "x" } });
    expect(await db.items.get(ITEM)).toMatchObject({ title: "C", notes: "y" });
  });

  it("drops a delete undone by a restore and never merges into a change being sent", async () => {
    const db = await localDb(USER);
    await db.items.put({ id: ITEM, title: "A", version: 1, deleted_at: null });
    await enqueue(db, { entity_type: "item", entity_id: ITEM, op: "delete", base_version: 1 }, false);
    expect((await db.items.get(ITEM))?.deleted_at).not.toBeNull();
    await enqueue(db, { entity_type: "item", entity_id: ITEM, op: "restore", base_version: 1 }, false);
    expect(await db.outbox.count()).toBe(0);
    expect((await db.items.get(ITEM))?.deleted_at).toBeNull();

    const first = await enqueue(
      db,
      { entity_type: "item", entity_id: ITEM, op: "update", data: { title: "B" } },
      false,
    );
    await db.outbox.where("mutation_id").equals(first.mutation_id).modify({ sending: true });
    await enqueue(db, { entity_type: "item", entity_id: ITEM, op: "update", data: { title: "C" } }, false);
    expect(await db.outbox.count()).toBe(2);
  });
});

describe("server changes", () => {
  it("upserts rows, lays unsent edits over them and removes a tombstoned container with its content", async () => {
    const db = await localDb(USER);
    await db.items.put({ id: ITEM, title: "Mine", version: 1, container_kind: "calendar", container_id: CAL });
    await enqueue(db, { entity_type: "item", entity_id: ITEM, op: "update", data: { title: "Mine" } }, false);
    await applyServerChanges(db, [
      {
        entity_type: "calendar",
        entity_id: CAL,
        op: "upsert",
        version: 2,
        data: { id: CAL, name: "Work", version: 2 },
      },
      {
        entity_type: "item",
        entity_id: ITEM,
        op: "upsert",
        version: 2,
        data: { id: ITEM, title: "Theirs", notes: "n", version: 2, container_kind: "calendar", container_id: CAL },
      },
      { entity_type: "board", entity_id: OTHER, op: "upsert", version: 1, data: { id: OTHER } },
    ]);
    expect(await db.items.get(ITEM)).toMatchObject({ title: "Mine", notes: "n", version: 2 });
    expect(await db.calendars.get(CAL)).toMatchObject({ name: "Work" });

    await applyServerChanges(db, [{ entity_type: "calendar", entity_id: CAL, op: "tombstone", version: 3 }]);
    expect(await db.calendars.get(CAL)).toBeUndefined();
    expect(await db.items.get(ITEM)).toBeUndefined();
  });
});

function engineClient(): QueryClient {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } });
}

const pushed = (calls: Call[]) =>
  calls
    .filter((c) => c.method === "POST" && c.path === "/sync/push")
    .flatMap((c) => (c.body as { mutations: { mutation_id: string; op: string }[] }).mutations);

describe("sync engine", () => {
  it("sends the outbox, stores the new version and pulls until done", async () => {
    setOnline(true);
    const db = await localDb(USER);
    const entry = await enqueue(
      db,
      { entity_type: "calendar", entity_id: CAL, op: "create", data: { name: "Work", color: "#00f" } },
      false,
    );
    let page = 0;
    const calls = stubApi({
      "POST /sync/push": () => json({ results: [{ mutation_id: entry.mutation_id, status: "applied", version: 1 }] }),
      "GET /sync/pull": () => {
        page += 1;
        return page === 1
          ? json({
              changes: [
                {
                  entity_type: "calendar",
                  entity_id: OTHER,
                  op: "upsert",
                  version: 4,
                  data: { id: OTHER, version: 4 },
                },
              ],
              cursor: "c1",
              has_more: true,
            })
          : json({ changes: [], cursor: "c2", has_more: false });
      },
    });
    startSync(USER, engineClient());
    await waitFor(async () => {
      expect((await db.meta.get("cursor"))?.value).toBe("c2");
    });
    expect(pushed(calls)).toEqual([expect.objectContaining({ mutation_id: entry.mutation_id, op: "create" })]);
    expect(calls.filter((c) => c.path.startsWith("/sync/pull")).map((c) => c.path)).toEqual([
      "/sync/pull?limit=500",
      "/sync/pull?limit=500&since=c1",
    ]);
    expect(await db.outbox.count()).toBe(0);
    expect(await db.calendars.get(CAL)).toMatchObject({ version: 1, name: "Work" });
    expect(await db.calendars.get(OTHER)).toMatchObject({ version: 4 });
    await waitFor(() => {
      expect(syncStatus()).toMatchObject({ state: "idle", pending: 0 });
    });
  });

  // +++===+++ 2026-11-12 15:31 +04 — Hasan Alizada — HAAL-174 (UAT finding F12). Preferences changed on another device
  // arrive as the synced settings row; a newer version than the one on screen refreshes the settings at once, the same
  // version (this device's own save) asks nothing more of the server.
  it("refreshes the preferences when a newer settings row arrives", async () => {
    setOnline(true);
    const client = engineClient();
    client.setQueryData(settingsQueryKey, settings({ version: 3 }));
    const watching = new QueryObserver(client, settingsQuery).subscribe(() => undefined);
    let served = settings({ version: 3 });
    let pulled = 0;
    const row = (version: number, theme: string) => ({
      entity_type: "settings",
      entity_id: USER,
      op: "upsert",
      version,
      data: { ...settings({ version, theme: theme as "dark" }), owner_id: USER },
    });
    const calls = stubApi({
      "GET /me/settings": () => json(served),
      "GET /sync/pull": () => {
        pulled += 1;
        return json({ changes: pulled === 1 ? [row(3, "system")] : [], cursor: `c${String(pulled)}`, has_more: false });
      },
    });
    startSync(USER, client);
    const db = await localDb(USER);
    await waitFor(async () => {
      expect((await db.meta.get("cursor"))?.value).toBe("c1");
    });
    // The same version as on screen: nothing is asked.
    expect(calls.filter((c) => c.path === "/me/settings")).toHaveLength(0);

    served = settings({ version: 4, theme: "dark" });
    await applyServerChanges(db, [row(4, "dark")] as never);
    localChanged(USER);
    await waitFor(() => {
      expect(client.getQueryData<Settings>(settingsQueryKey)).toMatchObject({ version: 4, theme: "dark" });
    });
    watching();
  });

  // +++===+++ 2026-10-31 — Hasan Alizada — HAAL-142. Started while the server could not be reached, the app holds the
  // profile from this device, without a CSRF token; once the server answers, sync first takes the live session (and its
  // token) instead of sending without one (403 until the 30 s re-check; found by the offline end-to-end tests).
  it("takes the live session before it sends when the app started on the profile from this device", async () => {
    setOnline(true);
    await rememberProfile(me());
    setCsrfToken(null);
    let reachable = false;
    const calls = stubApi({
      "GET /me": () => (reachable ? json(me()) : Promise.reject(new TypeError("Failed to fetch"))),
      "POST /sync/push": (call) =>
        json({
          results: (call.body as { mutations: { mutation_id: string }[] }).mutations.map((m) => ({
            mutation_id: m.mutation_id,
            status: "applied",
            version: 1,
          })),
        }),
      "GET /sync/pull": () => json({ changes: [], cursor: "c1", has_more: false }),
    });
    const queryClient = engineClient();
    expect(isDeviceProfile(await queryClient.query(meQuery))).toBe(true);
    const db = await localDb(USER);
    await enqueue(db, { entity_type: "calendar", entity_id: CAL, op: "create", data: { name: "Work" } }, false);

    reachable = true;
    startSync(USER, queryClient);
    await waitFor(async () => {
      expect(await db.outbox.count()).toBe(0);
    });
    const push = calls.find((c) => c.path === "/sync/push");
    expect(push?.headers.get("X-CSRF-Token")).toBe("csrf-1");
    expect(calls.findIndex((c) => c.path === "/me")).toBeLessThan(calls.indexOf(push as Call));
    await forgetProfile();
  });

  it("keeps a conflict with both versions and tells the user on this device", async () => {
    setOnline(true);
    const db = await localDb(USER);
    await db.items.put({ id: ITEM, title: "A", version: 1, deleted_at: null });
    const entry = await enqueue(
      db,
      {
        entity_type: "item",
        entity_id: ITEM,
        op: "update",
        base_version: 1,
        base: { title: "A" },
        data: { title: "Mine" },
      },
      false,
    );
    const theirs = { id: ITEM, title: "Theirs", version: 2, deleted_at: null };
    stubApi({
      "POST /sync/push": () =>
        json({
          results: [
            { mutation_id: entry.mutation_id, status: "conflict", version: 2, fields: ["title"], current: theirs },
          ],
        }),
    });
    startSync(USER, engineClient());
    await waitFor(async () => {
      expect(await db.conflicts.count()).toBe(1);
    });
    expect(await db.conflicts.get(entry.mutation_id)).toMatchObject({
      reason: "conflict",
      fields: ["title"],
      mine: { title: "Mine" },
      theirs,
    });
    expect(await db.items.get(ITEM)).toMatchObject({ title: "Theirs", version: 2 });
    expect(await db.outbox.count()).toBe(0);
    await waitFor(async () => {
      expect((await listLocalNotifications(USER)).map((n) => [n.kind, n.payload.reason])).toEqual([
        ["sync_error", "conflict"],
      ]);
    });
  });

  it("starts over after 410 and pauses after 401", async () => {
    setOnline(true);
    const db = await localDb(USER);
    await db.meta.put({ key: "cursor", value: "old" });
    const calls = stubApi({
      "GET /sync/pull": (call) =>
        call.path.includes("since=old")
          ? problem(410, "cursor_invalid")
          : json({ changes: [], cursor: "fresh", has_more: false }),
    });
    startSync(USER, engineClient());
    await waitFor(async () => {
      expect((await db.meta.get("cursor"))?.value).toBe("fresh");
    });
    expect(calls.filter((c) => c.path.startsWith("/sync/pull")).map((c) => c.path)).toEqual([
      "/sync/pull?limit=500&since=old",
      "/sync/pull?limit=500",
    ]);

    stubApi({ "GET /sync/pull": () => problem(401, "session_expired") });
    startSync(USER, engineClient()); // the same user again: a run now
    await waitFor(() => {
      expect(syncStatus().state).toBe("paused");
    });
  });

  // +++===+++ 2026-11-09 — Hasan Alizada — HAAL-155. The server was restored from a backup.
  it("after 410 removes the rows the server no longer has", async () => {
    setOnline(true);
    const db = await localDb(USER);
    await db.meta.put({ key: "cursor", value: "old" });
    await db.items.bulkPut([{ id: "on-server" }, { id: "after-the-backup" }]);
    stubApi({
      "GET /sync/pull": (call) =>
        call.path.includes("since=old")
          ? problem(410, "cursor_invalid")
          : json({
              changes: [
                { entity_type: "item", entity_id: "on-server", op: "upsert", version: 1, data: { id: "on-server" } },
              ],
              cursor: "fresh",
              has_more: false,
            }),
    });
    startSync(USER, engineClient());
    await waitFor(async () => {
      expect((await db.meta.get("cursor"))?.value).toBe("fresh");
      expect((await db.items.toArray()).map((row) => row.id)).toEqual(["on-server"]);
    });
    expect(await db.meta.get("fullSync")).toBeUndefined();
  });

  it("a full sync cut short removes nothing and starts again", async () => {
    setOnline(true);
    const db = await localDb(USER);
    await db.meta.put({ key: "cursor", value: "old" });
    await db.items.bulkPut([{ id: "second-page" }]);
    const pages = (call: Call) =>
      call.path.includes("since=page")
        ? problem(500, "internal_error")
        : json({ changes: [], cursor: "page", has_more: true });
    stubApi({
      "GET /sync/pull": (call) => (call.path.includes("since=old") ? problem(410, "cursor_invalid") : pages(call)),
    });
    startSync(USER, engineClient());
    await waitFor(async () => {
      expect((await db.meta.get("cursor"))?.value).toBe("page");
      expect(syncStatus().state).toBe("error");
    });
    expect(await db.items.count()).toBe(1);
    expect((await db.meta.get("fullSync"))?.value).toBe(true);

    const second = stubApi({
      "GET /sync/pull": () =>
        json({
          changes: [
            { entity_type: "item", entity_id: "second-page", op: "upsert", version: 1, data: { id: "second-page" } },
          ],
          cursor: "fresh",
          has_more: false,
        }),
    });
    startSync(USER, engineClient());
    await waitFor(async () => {
      expect((await db.meta.get("cursor"))?.value).toBe("fresh");
    });
    expect(second.find((c) => c.path.startsWith("/sync/pull"))?.path).toBe("/sync/pull?limit=500");
    expect(await db.items.count()).toBe(1);
  });

  it("keeps a row still waiting to be sent when the server no longer has it", async () => {
    const db = await localDb(USER);
    await db.items.bulkPut([{ id: "waiting" }, { id: "gone" }]);
    await db.outbox.add({
      mutation_id: "m1",
      entity_type: "item",
      entity_id: "waiting",
      op: "update",
      base_version: 1,
      base: {},
      data: { title: "Mine" },
      state: "pending",
    } as never);
    await removeRowsNotOnServer(db, new Set());
    expect((await db.items.toArray()).map((row) => row.id)).toEqual(["waiting"]);
  });

  it("says a change made offline is kept on this device and announces it when it arrives", async () => {
    setOnline(false);
    const calls = stubApi({
      "GET /me": () => json(me()),
      "POST /sync/push": (call) =>
        json({
          results: (call.body as { mutations: { mutation_id: string }[] }).mutations.map((m) => ({
            mutation_id: m.mutation_id,
            status: "applied",
            version: 1,
          })),
        }),
    });
    renderApp("/calendar");
    await waitFor(() => {
      expect(syncStatus().state).toBe("offline");
    });
    await runWrite({
      name: "calendar_create",
      run: () => mutate(USER, { entity_type: "calendar", entity_id: CAL, op: "create", data: { name: "Work" } }),
      success: "Calendar created.",
    });
    expect(
      await screen.findByText("Saved on this device. It will sync when the connection is back."),
    ).toBeInTheDocument();
    // +++===+++ 2026-11-12 15:45 +04 — Hasan Alizada — HAAL-174 (F22): the message names what was done as well.
    expect(screen.getByText("Calendar created.")).toBeInTheDocument();
    expect((await screen.findAllByText("Offline — 1 change waits on this device")).length).toBeGreaterThan(0);
    expect(pushed(calls)).toEqual([]);

    setOnline(true);
    window.dispatchEvent(new Event("online"));
    expect(await screen.findByText("1 change synced.")).toBeInTheDocument();
    expect(pushed(calls)).toHaveLength(1);
    const db = await localDb(USER);
    expect(await db.outbox.count()).toBe(0);
  });
});

// +++===+++ 2026-11-12 15:41 +04 — Hasan Alizada — HAAL-174 (UAT finding F22). An offline create or delete says what
// was done, that it is kept on this device, and offers Undo like an online one. Undoing a create still waiting in the
// outbox sends the create and the delete together once the connection is back (the record goes to the trash, as
// online); undoing a delete still waiting cancels both, nothing is sent.
describe("offline undo", () => {
  async function offlineApp() {
    setOnline(false);
    const calls = stubApi({
      "GET /me": () => json(me()),
      "POST /sync/push": (call) =>
        json({
          results: (call.body as { mutations: { mutation_id: string }[] }).mutations.map((m) => ({
            mutation_id: m.mutation_id,
            status: "applied",
            version: 1,
          })),
        }),
    });
    renderApp("/calendar");
    await waitFor(() => {
      expect(syncStatus().state).toBe("offline");
    });
    return { calls, user: userEvent.setup(), db: await localDb(USER) };
  }

  it("offers Undo for a create made offline; both changes are sent when the connection is back", async () => {
    const { calls, user, db } = await offlineApp();
    await createCalendar(USER, "Work", "red");
    const toast = (await screen.findByText("Calendar created: Work")).closest("li") as HTMLElement;
    expect(toast).toHaveTextContent("Saved on this device. It will sync when the connection is back.");
    await user.click(within(toast).getByRole("button", { name: "Undo" }));

    await waitFor(async () => {
      expect((await db.outbox.toArray()).map((e) => e.op)).toEqual(["create", "delete"]);
    });
    const [created] = await db.outbox.toArray();
    expect((await db.calendars.get(created?.entity_id ?? ""))?.deleted_at).toBeTruthy();

    setOnline(true);
    window.dispatchEvent(new Event("online"));
    await waitFor(() => {
      expect(pushed(calls).map((m) => m.op)).toEqual(["create", "delete"]);
    });
  });

  it("offers Undo for a delete made offline; undone, nothing is sent", async () => {
    const { calls, user, db } = await offlineApp();
    await db.calendars.put({ id: CAL, name: "Work", color: "red", owner_id: USER, version: 2, deleted_at: null });
    await deleteCalendar(USER, { id: CAL, name: "Work", version: 2 });
    const toast = (await screen.findByText(/Work.*deleted|Deleted.*Work/)).closest("li") as HTMLElement;
    expect(toast).toHaveTextContent("Saved on this device. It will sync when the connection is back.");
    await user.click(within(toast).getByRole("button", { name: "Undo" }));

    await waitFor(async () => {
      expect(await db.outbox.count()).toBe(0);
    });
    expect((await db.calendars.get(CAL))?.deleted_at ?? null).toBeNull();
    setOnline(true);
    window.dispatchEvent(new Event("online"));
    await waitFor(() => {
      expect(syncStatus().state).not.toBe("offline");
    });
    expect(pushed(calls)).toEqual([]);
  });
});

describe("device storage", () => {
  it("names a full device storage instead of a missing connection", async () => {
    setOnline(true);
    stubApi({ "GET /me": () => json(me()) });
    renderApp("/calendar");
    const db = await localDb(USER);
    vi.spyOn(db.outbox, "add").mockRejectedValue(new DOMException("full", "QuotaExceededError"));
    const result = await runWrite({
      name: "calendar_create",
      run: () => mutate(USER, { entity_type: "calendar", entity_id: CAL, op: "create", data: { name: "Work" } }),
      success: "Calendar created.",
    });
    expect(result).toMatchObject({ ok: false, code: "storage_full" });
    expect(await screen.findByText(/this device has no room left for offline data/)).toBeInTheDocument();
    expect(await db.calendars.get(CAL)).toBeUndefined();
  });
});

describe("sign-out", () => {
  it("names the changes that never reached the server and deletes the local database", async () => {
    setOnline(false);
    const calls = stubApi({ "GET /me": () => json(me()), "POST /auth/logout": () => noContent() });
    const { router } = renderApp("/calendar");
    await waitFor(() => {
      expect(syncStatus().state).toBe("offline");
    });
    await mutate(USER, { entity_type: "calendar", entity_id: CAL, op: "create", data: { name: "Work" } });
    await mutate(USER, { entity_type: "item", entity_id: ITEM, op: "create", data: { title: "Call" } });
    expect(await prepareSignOut(USER, 50)).toBe(2);

    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: "Account menu of Ada Admin" }));
    await user.click(within(await screen.findByRole("menu")).getByRole("menuitem", { name: "Sign out" }));
    const dialog = await screen.findByRole("dialog", { name: "Sign out and lose unsent changes?" });
    expect(dialog).toHaveTextContent("2 changes have not reached the server yet");
    await user.click(within(dialog).getByRole("button", { name: "Sign out anyway" }));
    await waitFor(() => {
      expect(router.state.location.pathname).toBe("/login");
    });
    expect(calls.some((c) => c.path === "/auth/logout")).toBe(true);
    expect(await Dexie.exists(dbName(USER))).toBe(false);
  }, 15_000);
});
