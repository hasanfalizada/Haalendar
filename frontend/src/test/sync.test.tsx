// +++===+++ 2026-10-21 — Hasan Alizada — HAAL-052. Local store and outbox (FR-OFF-01/02/03, ADR-0009, D-57): changes
// are written locally and to the outbox in one step, later edits of the same record merge, pulled rows never hide an
// unsent edit, tombstones remove a container with its content, the engine sends the outbox and pulls until done,
// conflicts and rejections are kept with both versions and a notification, 410 starts over, 401 pauses, offline writes
// say "saved on this device" and are announced when they arrive, sign-out names the unsent changes and deletes the
// local database.
import { QueryClient } from "@tanstack/react-query";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import Dexie from "dexie";
import { afterEach, describe, expect, it, vi } from "vitest";

import "@/api/client";
import { runWrite } from "@/api/write";
import { listLocalNotifications } from "@/lib/localNotifications";
import { mutate, prepareSignOut, startSync, syncStatus } from "@/sync";
import { dbName, localDb } from "@/sync/db";
import { applyServerChanges } from "@/sync/local";
import { enqueue } from "@/sync/outbox";

import { type Call, json, me, noContent, problem, renderApp, stubApi } from "./fake-api";

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
    expect(screen.queryByText("Calendar created.")).not.toBeInTheDocument();
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
