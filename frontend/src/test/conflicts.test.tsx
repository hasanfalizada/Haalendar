// +++===+++ 2026-10-22 — Hasan Alizada — HAAL-054. Conflict resolution (FR-OFF-04, ADR-0009): unresolved conflicts are
// shown (connection indicator, Settings → Sync, notification center, the record itself), fields are resolved per field
// or all at once (keep mine = a new change on the current server version), a record deleted elsewhere is restored with
// my changes or my changes are discarded, a refused change can be copied and dismissed, resolved records are kept
// (marked), a delete of something changed elsewhere is told, and an answer missing results does not loop.
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider, createMemoryHistory, createRootRoute, createRouter } from "@tanstack/react-router";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import "@/api/client";
import { meQueryKey } from "@/api/session";
import { ConflictNotice } from "@/components/sync/ConflictNotice";
import { addLocalNotification, listLocalNotifications } from "@/lib/localNotifications";
import { startSync, syncStatus } from "@/sync";
import { type ConflictRecord, localDb } from "@/sync/db";
import { enqueue } from "@/sync/outbox";

import { type Call, json, me, renderApp, stubApi } from "./fake-api";

const USER = me().id;
const ITEM = "0199f000-0000-7000-8000-0000000000e1";
const CAL = "0199f000-0000-7000-8000-0000000000c1";

const theirsItem = {
  id: ITEM,
  title: "Dentist 10:00",
  body: "Bring the card",
  color: "red",
  priority: "high",
  version: 5,
  deleted_at: null,
  container_kind: "calendar",
  container_id: CAL,
};

function conflict(overrides: Partial<ConflictRecord> = {}): ConflictRecord {
  return {
    id: "0199f000-0000-7000-8000-00000000aaa1",
    entity_type: "item",
    entity_id: ITEM,
    op: "update",
    reason: "conflict",
    fields: ["title", "color"],
    mine: { title: "Dentist 9:00", color: "blue", priority: "low" },
    theirs: theirsItem,
    created_at: "2026-10-22T08:00:00Z",
    ...overrides,
  };
}

async function seed(record: ConflictRecord, row: Record<string, unknown> | null = theirsItem): Promise<void> {
  const db = await localDb(USER);
  if (row) await db.items.put(row);
  await db.conflicts.put(record);
}

function pushedMutations(calls: Call[]) {
  return calls
    .filter((c) => c.method === "POST" && c.path === "/sync/push")
    .flatMap(
      (c) =>
        (
          c.body as {
            mutations: {
              op: string;
              base?: Record<string, unknown>;
              data?: Record<string, unknown>;
              base_version?: number;
            }[];
          }
        ).mutations,
    );
}

async function openSync() {
  const calls = stubApi({ "GET /me": () => json(me()) });
  renderApp("/settings#sync");
  const section = await screen.findByRole("region", { name: "Sync" });
  return { calls, section, user: userEvent.setup() };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("unresolved conflicts are shown", () => {
  it("in the connection indicator (a link to Settings → Sync) and in the section with both values", async () => {
    await seed(conflict());
    const { section } = await openSync();
    await waitFor(() => {
      expect(screen.getAllByRole("link", { name: "1 sync conflict — resolve" })[0]).toHaveAttribute(
        "href",
        "/settings#sync",
      );
    });
    const card = await within(section).findByRole("listitem", { name: "Item: Dentist 10:00" });
    expect(card).toHaveTextContent("Changed here and on another device");
    expect(within(card).getByRole("radio", { name: /Mine \(this device\)\s*Dentist 9:00/ })).toBeInTheDocument();
    expect(within(card).getByRole("radio", { name: /Theirs \(server\)\s*Dentist 10:00/ })).toBeInTheDocument();
    expect(within(card).getByRole("radio", { name: /Theirs \(server\)\s*Red/ })).toBeInTheDocument();
    // Only the conflicting fields are offered (priority applied without conflict).
    expect(within(card).queryByText("Priority")).not.toBeInTheDocument();
  });

  it("inside the record, leading to Settings → Sync", async () => {
    await seed(conflict());
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    queryClient.setQueryData(meQueryKey, me());
    const root = createRootRoute({
      component: () => (
        <>
          <ConflictNotice entityId={ITEM} />
          <ConflictNotice entityId={CAL} />
        </>
      ),
    });
    const router = createRouter({ routeTree: root, history: createMemoryHistory({ initialEntries: ["/"] }) });
    render(
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>,
    );
    expect(await screen.findByText(/This has a sync conflict\./)).toBeInTheDocument();
    expect(screen.getAllByRole("status")).toHaveLength(1); // nothing for a record without conflicts
    expect(screen.getByRole("link", { name: "Resolve" })).toHaveAttribute("href", "/settings#sync");
  });
});

describe("resolving", () => {
  it("per field: mine goes out as a new change on the current version, theirs stays; the record is kept", async () => {
    await seed(conflict());
    const { calls, section, user } = await openSync();
    const card = await within(section).findByRole("listitem", { name: "Item: Dentist 10:00" });
    const apply = within(card).getByRole("button", { name: "Apply my choice" });
    expect(apply).toBeDisabled();
    await user.click(within(card).getByRole("radio", { name: /Mine \(this device\)\s*Dentist 9:00/ }));
    await user.click(within(card).getByRole("radio", { name: /Theirs \(server\)\s*Red/ }));
    await user.click(apply);
    expect(await within(section).findByText(/No conflicts/)).toBeInTheDocument();
    await waitFor(() => {
      expect(pushedMutations(calls)).toEqual([
        expect.objectContaining({
          op: "update",
          base_version: 5,
          base: { title: "Dentist 10:00" },
          data: { title: "Dentist 9:00" },
        }),
      ]);
    });
    const db = await localDb(USER);
    const resolved = await db.conflicts.get(conflict().id);
    expect(resolved?.resolution).toBe("mixed");
    expect(typeof resolved?.resolved_at).toBe("string");
    expect((await db.items.get(ITEM))?.title).toBe("Dentist 9:00");
  });

  it("keep all theirs sends nothing", async () => {
    await seed(conflict());
    const { calls, section, user } = await openSync();
    const card = await within(section).findByRole("listitem", { name: "Item: Dentist 10:00" });
    await user.click(within(card).getByRole("button", { name: "Keep all theirs" }));
    expect(await within(section).findByText(/No conflicts/)).toBeInTheDocument();
    expect(pushedMutations(calls)).toEqual([]);
    const db = await localDb(USER);
    expect((await db.conflicts.get(conflict().id))?.resolution).toBe("theirs");
    await waitFor(() => {
      expect(syncStatus().conflicts).toBe(0);
    });
  });

  it("deleted elsewhere: restore with my changes", async () => {
    const deleted = { ...theirsItem, deleted_at: "2026-10-22T07:00:00Z" };
    await seed(
      conflict({
        reason: "rejected",
        fields: ["title"],
        mine: { title: "Dentist 9:00" },
        theirs: deleted,
        problem: { code: "invalid_state" },
      }),
      deleted,
    );
    const { calls, section, user } = await openSync();
    const card = await within(section).findByRole("listitem", { name: "Item: Dentist 10:00" });
    expect(card).toHaveTextContent("Changed here, deleted on another device");
    await user.click(within(card).getByRole("button", { name: "Restore with my changes" }));
    expect(await within(section).findByText(/No conflicts/)).toBeInTheDocument();
    await waitFor(() => {
      expect(pushedMutations(calls).map((m) => [m.op, m.data])).toEqual([
        ["restore", undefined],
        ["update", { title: "Dentist 9:00" }],
      ]);
    });
    const db = await localDb(USER);
    expect(await db.items.get(ITEM)).toMatchObject({ deleted_at: null, title: "Dentist 9:00" });
  });

  it("deleted elsewhere: discarding asks first and keeps the record marked", async () => {
    const deleted = { ...theirsItem, deleted_at: "2026-10-22T07:00:00Z" };
    await seed(
      conflict({ reason: "rejected", mine: { title: "x" }, theirs: deleted, problem: { code: "invalid_state" } }),
      deleted,
    );
    const { calls, section, user } = await openSync();
    const card = await within(section).findByRole("listitem", { name: "Item: Dentist 10:00" });
    await user.click(within(card).getByRole("button", { name: "Discard my changes" }));
    const dialog = await screen.findByRole("dialog", { name: "Discard your changes?" });
    await user.click(within(dialog).getByRole("button", { name: "Discard my changes" }));
    expect(await within(section).findByText(/No conflicts/)).toBeInTheDocument();
    expect(pushedMutations(calls)).toEqual([]);
    const db = await localDb(USER);
    expect((await db.conflicts.get(conflict().id))?.resolution).toBe("discarded");
  });

  it("refused: the reason, copy my values, dismiss", async () => {
    await seed(
      conflict({
        reason: "rejected",
        fields: ["title", "body"],
        mine: { title: "Dentist 9:00", body: "**Bring** the card" },
        theirs: null,
        problem: { code: "forbidden" },
      }),
      null,
    );
    const { section, user } = await openSync();
    const card = await within(section).findByRole("listitem", { name: "Item: Dentist 9:00" });
    expect(card).toHaveTextContent("you do not have permission");
    expect(card).toHaveTextContent("Bring the card"); // Markdown as plain text
    await user.click(within(card).getByRole("button", { name: "Copy my changes" }));
    // user-event provides the clipboard.
    expect(await navigator.clipboard.readText()).toBe("Title: Dentist 9:00\nNotes: **Bring** the card");
    await user.click(within(card).getByRole("button", { name: "Dismiss" }));
    await user.click(
      within(await screen.findByRole("dialog", { name: "Dismiss this change?" })).getByRole("button", {
        name: "Dismiss",
      }),
    );
    expect(await within(section).findByText(/No conflicts/)).toBeInTheDocument();
    const db = await localDb(USER);
    expect((await db.conflicts.get(conflict().id))?.resolution).toBe("dismissed");
  });
});

describe("notifications", () => {
  it("a sync problem opens Settings → Sync, a delete of something changed elsewhere opens the trash", async () => {
    await addLocalNotification(USER, "sync_error", { entity_type: "item", reason: "deleted_changed" });
    stubApi({ "GET /me": () => json(me()), "GET /trash": () => json({ data: [], next_cursor: null }) });
    const { router } = renderApp("/calendar");
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: /^Notifications/ }));
    await user.click(await screen.findByText(/It is in the trash if you need it back/));
    await waitFor(() => {
      expect(router.state.location.pathname).toBe("/trash");
    });

    await addLocalNotification(USER, "sync_error", { entity_type: "item", reason: "conflict" });
    await user.click(await screen.findByRole("button", { name: /^Notifications/ }));
    await user.click(await screen.findByText(/someone changed the same fields/));
    await waitFor(() => {
      expect(router.state.location.hash).toBe("sync");
    });
  });
});

describe("engine", () => {
  it("tells about a delete of something changed elsewhere and keeps the op of a refused change", async () => {
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(true);
    const db = await localDb(USER);
    await db.items.put(theirsItem);
    const gone = await enqueue(db, { entity_type: "item", entity_id: ITEM, op: "delete", base_version: 4 }, false);
    const moved = await enqueue(
      db,
      {
        entity_type: "item",
        entity_id: CAL,
        op: "move",
        base: {},
        data: { container_kind: "calendar", container_id: CAL },
      },
      false,
    );
    stubApi({
      "POST /sync/push": () =>
        json({
          results: [
            { mutation_id: gone.mutation_id, status: "applied", version: 6, edited_elsewhere: true },
            {
              mutation_id: moved.mutation_id,
              status: "rejected",
              problem: { code: "not_found", status: 404, title: "x" },
            },
          ],
        }),
    });
    startSync(USER, new QueryClient());
    await waitFor(async () => {
      expect((await listLocalNotifications(USER)).map((n) => n.payload.reason).sort()).toEqual([
        "deleted_changed",
        "rejected",
      ]);
    });
    expect(await db.conflicts.get(moved.mutation_id)).toMatchObject({ op: "move", reason: "rejected" });
  });

  it("an answer without results for some changes does not send them again and again", async () => {
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(true);
    const db = await localDb(USER);
    await db.calendars.put({ id: CAL, name: "Work", version: 1 });
    await enqueue(db, { entity_type: "calendar", entity_id: CAL, op: "update", data: { name: "x" } }, false);
    const calls = stubApi({ "POST /sync/push": () => json({ results: [] }) });
    startSync(USER, new QueryClient());
    await waitFor(() => {
      expect(syncStatus().state).toBe("error");
    });
    expect(calls.filter((c) => c.path === "/sync/push")).toHaveLength(1);
    expect(await db.outbox.count()).toBe(1);
  });
});
