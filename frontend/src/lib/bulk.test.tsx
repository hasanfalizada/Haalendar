// +++===+++ 2026-10-16 — Hasan Alizada — HAAL-036. Bulk actions: one request, one notification, one undo step (delete
// undone by restoring with the new versions, a color change undone with every row's previous color), refusals with
// "N of M" and the refused ids, the bulk bar showing only supported actions.
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { BulkBar } from "@/components/ui/bulk-bar";
import { type Call, json, problem, renderWithProviders, stubApi } from "@/test/fake-api";
import "@/i18n";

import { type BulkSelected, refusedIds, runBulk } from "./bulk";
import { clearUndo, undo } from "./undo";
import { useSelection } from "./useSelection";

const ITEMS: BulkSelected[] = [
  { type: "calendar", id: "c1", version: 3, color: "blue" },
  { type: "calendar", id: "c2", version: 5, color: "red" },
];

function answer(call: Call) {
  const body = call.body as { targets: { type: string; id: string; version: number }[] };
  return json({
    applied: body.targets.length,
    delete_batch_id: null,
    items: body.targets.map((t) => ({ type: t.type, id: t.id, version: t.version + 1 })),
  });
}

const bodies = (calls: Call[]) => calls.filter((c) => c.path === "/bulk").map((c) => c.body);

describe("runBulk", () => {
  beforeEach(() => {
    clearUndo();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("deletes in one request and undoes by restoring with the new versions", async () => {
    const calls = stubApi({ "POST /bulk": answer });
    renderWithProviders(<div />);
    const result = await runBulk({
      action: "delete",
      items: ITEMS,
      label: { key: "bulk.labels.delete", values: { count: "2" } },
      success: "2 calendars deleted.",
    });
    expect(result.ok).toBe(true);
    expect(await screen.findByText("2 calendars deleted.")).toBeInTheDocument();
    expect(calls.filter((c) => c.path === "/bulk")[0]?.headers.get("Idempotency-Key")).toBeTruthy();

    await undo();
    expect(await screen.findByText("Undone: deleting 2 items.")).toBeInTheDocument();
    expect(bodies(calls)).toEqual([
      {
        action: "delete",
        targets: [
          { type: "calendar", id: "c1", version: 3 },
          { type: "calendar", id: "c2", version: 5 },
        ],
      },
      {
        action: "restore",
        targets: [
          { type: "calendar", id: "c1", version: 4 },
          { type: "calendar", id: "c2", version: 6 },
        ],
      },
    ]);
  });

  it("undoes a color change with every row's previous color", async () => {
    const calls = stubApi({ "POST /bulk": answer });
    renderWithProviders(<div />);
    await runBulk({
      action: "set_color",
      items: ITEMS,
      value: "green",
      label: { key: "bulk.labels.color", values: { count: "2" } },
      success: "Color changed.",
    });
    await undo();
    expect(bodies(calls)[1]).toEqual({
      action: "set_color",
      targets: [
        { type: "calendar", id: "c1", version: 4, color: "blue" },
        { type: "calendar", id: "c2", version: 6, color: "red" },
      ],
    });
    expect(bodies(calls)[0]).toMatchObject({ action: "set_color", color: "green" });
  });

  it("says how many of the selection blocked it and names them", async () => {
    stubApi({
      "POST /bulk": () =>
        problem(412, "version_conflict", {
          errors: [{ pointer: "/targets/1", detail: "Changed elsewhere in the meantime", code: "version_conflict" }],
        }),
    });
    renderWithProviders(<div />);
    const result = await runBulk({
      action: "delete",
      items: ITEMS,
      label: { key: "bulk.labels.delete", values: { count: "2" } },
      success: "Deleted.",
    });
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "1 of 2 selected was changed elsewhere in the meantime. Nothing was changed",
    );
    expect(refusedIds(result, ITEMS)).toEqual(["c2"]);
  });
});

function Bar({ onAction }: { onAction: (action: string, value?: string) => void }) {
  const selection = useSelection(["a", "b", "c"]);
  return (
    <>
      <button
        type="button"
        onClick={() => {
          selection.toggle("a");
        }}
      >
        pick a
      </button>
      <BulkBar selection={selection} total={3} actions={["set_color", "delete"]} onAction={onAction} />
    </>
  );
}

describe("BulkBar", () => {
  it("shows the count and only the supported actions", async () => {
    const onAction = vi.fn();
    render(<Bar onAction={onAction} />);
    const user = userEvent.setup();
    expect(screen.getByText(/Select with the checkboxes/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "pick a" }));
    expect(screen.getByText("1 of 3 selected")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Priority" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Restore selected" })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Color" }));
    await user.click(await screen.findByRole("menuitem", { name: "Green" }));
    expect(onAction).toHaveBeenCalledWith("set_color", "green");
    await user.click(screen.getByRole("button", { name: "Delete selected" }));
    expect(onAction).toHaveBeenLastCalledWith("delete");

    await user.click(screen.getByRole("checkbox", { name: "Select all" }));
    expect(screen.getByText("3 of 3 selected")).toBeInTheDocument();
  });
});
