// +++===+++ 2026-10-16 — Hasan Alizada — HAAL-033. Trash page: list with contents and who deleted, restore one,
// multi-select (Shift range, select all, Esc), restoring a container that is in the trash too, module filter.
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { TrashEntry } from "@/api/generated/types.gen";
import { mutate } from "@/sync";

import { type Call, json, me, renderApp, stubApi } from "./fake-api";

const ADA = me();

function entry(n: number, overrides: Partial<TrashEntry> = {}): TrashEntry {
  return {
    type: "calendar",
    id: `0199f000-0000-7000-8000-00000000000${String(n)}`,
    title: `Calendar ${String(n)}`,
    deleted_at: new Date(Date.now() - n * 60_000).toISOString(),
    deleted_by: ADA.id,
    deleted_by_name: "Ada Admin",
    delete_batch_id: `0199f000-0000-7000-8000-0000000000b${String(n)}`,
    created_at: "2026-10-01T08:00:00Z",
    updated_at: "2026-10-01T08:00:00Z",
    contents: {},
    ...overrides,
  };
}

function restoredBodies(calls: Call[]) {
  return calls
    .filter((c) => c.path === "/trash/restore")
    .map((c) => (c.body as { entries: { id: string }[] }).entries.map((e) => e.id));
}

describe("trash page", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("shows an empty state", async () => {
    stubApi({ "GET /me": () => json(ADA), "GET /trash": () => json({ data: [], next_cursor: null }) });
    renderApp("/trash");
    expect(await screen.findByText("Trash is empty")).toBeInTheDocument();
  });

  // +++===+++ 2026-10-30 — Hasan Alizada — HAAL-140. Found by the end-to-end tests: a delete that reaches the server
  // after the trash was opened shows up without a reload.
  it("shows a delete pushed while it is open", async () => {
    let entries: TrashEntry[] = [];
    const calls = stubApi({
      "GET /me": () => json(ADA),
      "GET /trash": () => json({ data: entries, next_cursor: null }),
      "POST /sync/push": (call) => {
        entries = [entry(1, { type: "event", title: "Dentist" })];
        const { mutations } = call.body as { mutations: { mutation_id: string }[] };
        return json({ results: mutations.map((m) => ({ mutation_id: m.mutation_id, status: "applied", version: 2 })) });
      },
    });
    renderApp("/trash");
    expect(await screen.findByText("Trash is empty")).toBeInTheDocument();
    await mutate(ADA.id, { entity_type: "item", entity_id: "0199f000-0000-7000-8000-0000000000e1", op: "delete" });
    expect(await screen.findByText("Dentist")).toBeInTheDocument();
    expect(calls.some((c) => c.path === "/sync/push")).toBe(true);
  });

  it("lists entries with their contents and who deleted them, and restores one", async () => {
    let entries = [
      entry(1, { contents: { event: 37 }, deleted_by: "someone-else", deleted_by_name: "Bob Builder" }),
      entry(2),
    ];
    const calls = stubApi({
      "GET /me": () => json(ADA),
      "GET /trash": () => json({ data: entries, next_cursor: null }),
      "POST /trash/restore": () => {
        entries = entries.slice(1);
        return json({ restored: 1, rows: 38, failed: [] });
      },
    });
    renderApp("/trash");
    const first = (await screen.findByText("Calendar 1")).closest("li") as HTMLElement;
    expect(first).toHaveTextContent("Calendar · 37 events");
    expect(first).toHaveTextContent("by Bob Builder");
    expect(screen.getByText("Calendar 2").closest("li") as HTMLElement).toHaveTextContent("by you");

    await userEvent.setup().click(within(first).getByRole("button", { name: "Restore" }));
    expect(await screen.findByText("1 entry restored.")).toBeInTheDocument();
    expect(restoredBodies(calls)).toEqual([[entry(1).id]]);
    await waitFor(() => {
      expect(screen.queryByText("Calendar 1")).not.toBeInTheDocument();
    });
  });

  it("selects a range with Shift, selects all, clears with Esc and restores the selection", async () => {
    const entries = [entry(1), entry(2), entry(3), entry(4)];
    const calls = stubApi({
      "GET /me": () => json(ADA),
      "GET /trash": () => json({ data: entries, next_cursor: null }),
      "POST /trash/restore": () => json({ restored: 3, rows: 3, failed: [] }),
    });
    renderApp("/trash");
    const user = userEvent.setup();
    await user.click(await screen.findByRole("checkbox", { name: "Select Calendar 1" }));
    await user.keyboard("{Shift>}");
    await user.click(screen.getByRole("checkbox", { name: "Select Calendar 3" }));
    await user.keyboard("{/Shift}");
    expect(screen.getByText("3 of 4 selected")).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: "Select Calendar 4" })).not.toBeChecked();

    await user.click(screen.getByRole("checkbox", { name: "Select all" }));
    expect(screen.getByText("4 of 4 selected")).toBeInTheDocument();
    await user.keyboard("{Escape}");
    expect(screen.queryByText(/selected$/)).not.toBeInTheDocument();

    await user.click(screen.getByRole("checkbox", { name: "Select Calendar 2" }));
    await user.click(screen.getByRole("checkbox", { name: "Select Calendar 4" }));
    await user.click(screen.getByRole("button", { name: "Restore selected" }));
    expect(await screen.findByText("3 entries restored.")).toBeInTheDocument();
    expect(restoredBodies(calls)).toEqual([[entry(2).id, entry(4).id]]);
  });

  it("offers to restore a container that is in the trash too", async () => {
    const event = entry(1, { type: "event", title: "Dentist", container_name: "Work" });
    const work = { type: "calendar", id: "0199f000-0000-7000-8000-0000000000c9", title: "Work" };
    let call = 0;
    const calls = stubApi({
      "GET /me": () => json(ADA),
      "GET /trash": () => json({ data: [event], next_cursor: null }),
      "POST /trash/restore": () => {
        call += 1;
        return call === 1
          ? json({
              restored: 0,
              rows: 0,
              failed: [{ type: "event", id: event.id, code: "parent_in_trash", parent: work }],
            })
          : json({ restored: 2, rows: 2, failed: [] });
      },
    });
    renderApp("/trash");
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: "Restore" }));
    const dialog = await screen.findByRole("dialog", { name: "“Work” is in the trash too" });
    await user.click(within(dialog).getByRole("button", { name: "Restore both" }));
    expect(await screen.findByText("2 entries restored.")).toBeInTheDocument();
    expect(restoredBodies(calls)).toEqual([[event.id], [work.id, event.id]]);
  });

  it("filters by module", async () => {
    const calls = stubApi({
      "GET /me": () => json(ADA),
      "GET /trash": () => json({ data: [entry(1)], next_cursor: null }),
    });
    renderApp("/trash");
    await screen.findByText("Calendar 1");
    await userEvent.setup().selectOptions(screen.getByLabelText("Show"), "calendar");
    await waitFor(() => {
      expect(calls.some((c) => c.path.startsWith("/trash?") && c.path.includes("module=calendar"))).toBe(true);
    });
  });
});
