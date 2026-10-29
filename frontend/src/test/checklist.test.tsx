// +++===+++ 2026-10-29 — Hasan Alizada — HAAL-101. Checklists on the To-Do page (FR-TODO-02, D-88): the card shows up to
// 8 unchecked items with working checkboxes and the counts of the rest; New list opens the editor with a checklist —
// Enter adds the next item, Backspace in an empty one removes it, Alt+↑ moves one up — and Save writes the note and
// its items in order as one undo step; checking in the editor sends the item to "Checked"; Remove checklist deletes
// the items.
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { comparePositions } from "@/lib/position";
import { localDb } from "@/sync/db";

import { json, me, renderApp, stubApi } from "./fake-api";

const USER = me().id;
const SHOPPING = "0199f000-0000-7000-8000-0000000000b1";

const note = {
  id: SHOPPING,
  kind: "note",
  container_kind: "note",
  container_id: SHOPPING,
  title: "Shopping",
  body: "",
  color: "yellow",
  priority: "medium",
  pinned: false,
  archived_at: null,
  position: "U",
  is_checklist: true,
  deleted_at: null,
  version: 2,
};

const item = (n: number, text: string, position: string, checked = false) => ({
  id: `0199f000-0000-7000-8000-0000000001${String(n).padStart(2, "0")}`,
  item_id: SHOPPING,
  container_kind: "note",
  container_id: SHOPPING,
  text,
  position,
  checked,
  checked_at: checked ? "2026-10-29T10:00:00Z" : null,
  deleted_at: null,
  version: 1,
});

const ITEMS = [
  item(1, "Milk", "B"),
  item(2, "Bread", "C", true),
  ...Array.from({ length: 9 }, (_, i) => item(10 + i, `Thing ${String(i + 1)}`, `D${String(i + 1)}`)),
];

async function open() {
  const db = await localDb(USER);
  await db.items.put(note);
  await db.checklistItems.bulkPut(ITEMS);
  // Pushes never answer here, so the outbox keeps what the page wrote.
  stubApi({ "GET /me": () => json(me()), "POST /sync/push": () => new Promise<Response>(() => undefined) });
  renderApp("/todo");
  await screen.findByRole("button", { name: /Account menu/ });
  return { user: userEvent.setup(), db };
}

async function outbox() {
  const db = await localDb(USER);
  return db.outbox.orderBy("seq").toArray();
}

describe("checklists", { timeout: 20_000 }, () => {
  it("the card shows 8 unchecked items with working checkboxes and the counts of the rest", async () => {
    const { user, db } = await open();
    const card = await screen.findByRole("article", { name: "Shopping" });
    const list = within(card).getByRole("list", { name: "Checklist" });
    expect(within(list).getAllByRole("checkbox")).toHaveLength(8);
    expect(within(list).getAllByRole("listitem")[0]).toHaveTextContent("Milk");
    expect(within(card).getByText("+ 2 more items")).toBeInTheDocument();
    expect(within(card).getByText("+ 1 checked item")).toBeInTheDocument();

    await user.click(within(list).getByRole("checkbox", { name: "Milk" }));
    const toast = await screen.findByText("Checked Milk");
    expect(await outbox()).toMatchObject([
      {
        entity_type: "checklist_item",
        entity_id: ITEMS[0]?.id,
        op: "update",
        base: { checked: false },
        data: { checked: true },
      },
    ]);
    await waitFor(() => {
      expect(within(card).getByText("+ 2 checked items")).toBeInTheDocument();
    });
    await user.click(within(toast.closest("li") ?? document.body).getByRole("button", { name: "Undo" }));
    await waitFor(async () => {
      expect((await db.checklistItems.get(String(ITEMS[0]?.id)))?.checked).toBe(false);
    });
  });

  it("New list: Enter adds the next item, Backspace removes an empty one, Alt+↑ moves one; Save writes them in order", async () => {
    const { user, db } = await open();
    await user.click(await screen.findByRole("button", { name: "New list" }));
    const editor = await screen.findByRole("dialog", { name: "New note" });
    await user.type(within(editor).getByLabelText("Title"), "Packing");
    await user.click(within(editor).getByLabelText("Item 1"));
    await user.keyboard("Passport{Enter}Charger{Enter}{Backspace}");
    expect(within(editor).queryByLabelText("Item 3")).not.toBeInTheDocument();
    expect(within(editor).getByLabelText("Item 2")).toHaveFocus();
    await user.keyboard("{Enter}Socks{Alt>}{ArrowUp}{/Alt}");
    await waitFor(() => {
      expect(within(editor).getByLabelText("Item 2")).toHaveValue("Socks");
    });
    await user.click(within(editor).getByRole("button", { name: "Save" }));
    await screen.findByText("Created Packing");

    const writes = await outbox();
    expect(writes[0]).toMatchObject({ entity_type: "item", op: "create", data: { kind: "note", is_checklist: true } });
    const created = writes.slice(1).map((entry) => [entry.entity_type, entry.op, entry.data?.text]);
    expect(created).toEqual([
      ["checklist_item", "create", "Passport"],
      ["checklist_item", "create", "Socks"],
      ["checklist_item", "create", "Charger"],
    ]);
    const positions = writes.slice(1).map((entry) => String(entry.data?.position));
    expect([...positions].sort(comparePositions)).toEqual(positions);

    const toast = await screen.findByText("Created Packing");
    await user.click(within(toast.closest("li") ?? document.body).getByRole("button", { name: "Undo" }));
    await waitFor(async () => {
      expect((await db.items.get(String(writes[0]?.entity_id)))?.deleted_at).toBeTruthy();
    });
  });

  it("checking in the editor sends an item to Checked; Remove checklist deletes the items", async () => {
    const { user } = await open();
    await user.click(await screen.findByRole("button", { name: "Open Shopping" }));
    const editor = await screen.findByRole("dialog", { name: "Edit note" });
    expect(await within(editor).findByLabelText("Item 1")).toHaveValue("Milk");
    await user.click(within(editor).getByRole("checkbox", { name: "Milk" }));
    expect(within(editor).getByRole("button", { name: "Checked (2)" })).toHaveAttribute("aria-expanded", "true");
    expect(within(editor).getByLabelText("Item 1")).toHaveValue("Thing 1");
    await user.click(within(editor).getByRole("button", { name: "Save" }));
    await screen.findByText("Saved Shopping");
    expect(await outbox()).toMatchObject([
      { entity_type: "checklist_item", entity_id: ITEMS[0]?.id, op: "update", data: { checked: true } },
    ]);

    await user.click(await screen.findByRole("button", { name: "Open Shopping" }));
    const again = await screen.findByRole("dialog", { name: "Edit note" });
    await user.click(within(again).getByRole("button", { name: "Remove checklist" }));
    await user.type(within(again).getByLabelText("Note"), "Just text now");
    await user.click(within(again).getByRole("button", { name: "Save" }));
    await waitFor(async () => {
      const writes = await outbox();
      expect(writes.filter((entry) => entry.entity_type === "checklist_item" && entry.op === "delete")).toHaveLength(
        ITEMS.length,
      );
    });
    const writes = await outbox();
    expect(writes.find((entry) => entry.entity_type === "item")).toMatchObject({
      op: "update",
      base: { is_checklist: true },
      data: { is_checklist: false, body: "Just text now" },
    });
  });
});
