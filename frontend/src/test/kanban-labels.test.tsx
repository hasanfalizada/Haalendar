// +++===+++ 2026-10-29 — Hasan Alizada — HAAL-112 (stage 3). Board labels in the card editor (FR-KAN-03, D-92): labels are
// chosen in the form and written with Save in one step (on and off as label-on-card rows); "New label…" creates a
// board label at once (a taken name refused) and puts it on the card; a label is renamed / recoloured and deleted from
// the board (confirmation naming its cards, Undo); a view share changes nothing.
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { localDb } from "@/sync/db";

import { json, me, renderApp, stubApi } from "./fake-api";

const USER = me().id;
const BOARD = "0199f000-0000-7000-8000-0000000000b1";
const TODO = "0199f000-0000-7000-8000-0000000000d1";
const PLAN = "0199f000-0000-7000-8000-0000000000e1";
const URGENT = "0199f000-0000-7000-8000-0000000000f1";
const BUG = "0199f000-0000-7000-8000-0000000000f2";

const label = (id: string, name: string, color: string) => ({
  id,
  board_id: BOARD,
  container_kind: "board",
  container_id: BOARD,
  name,
  color,
  deleted_at: null,
  version: 1,
});

async function open(board: Record<string, unknown> = {}, share: Record<string, unknown> | null = null) {
  const db = await localDb(USER);
  await db.boards.put({
    id: BOARD,
    owner_id: USER,
    name: "Revamp",
    position: "U",
    archived_at: null,
    deleted_at: null,
    version: 2,
    ...board,
  });
  await db.boardColumns.put({
    id: TODO,
    board_id: BOARD,
    container_kind: "board",
    container_id: BOARD,
    name: "To do",
    position: "C",
    wip_limit: null,
    archived_at: null,
    deleted_at: null,
    version: 1,
  });
  await db.items.put({
    id: PLAN,
    kind: "card",
    container_kind: "board",
    container_id: BOARD,
    column_id: TODO,
    title: "Plan",
    body: "",
    color: "green",
    priority: "medium",
    position: "C",
    due_date: null,
    due_time: null,
    deleted_at: null,
    version: 2,
  });
  await db.labels.bulkPut([label(URGENT, "Urgent", "red"), label(BUG, "Bug", "orange")]);
  await db.itemLabels.put({
    id: "il1",
    item_id: PLAN,
    label_id: URGENT,
    container_kind: "board",
    container_id: BOARD,
    deleted_at: null,
  });
  if (share) await db.shares.put(share);
  // Pushes never answer here, so the outbox keeps what the page wrote.
  stubApi({ "GET /me": () => json(me()), "POST /sync/push": () => new Promise<Response>(() => undefined) });
  renderApp(`/kanban/${BOARD}`);
  await screen.findByRole("heading", { name: "Revamp", level: 1 });
  const user = userEvent.setup();
  await user.click(await screen.findByRole("button", { name: "Open Plan" }));
  const editor = await screen.findByRole("dialog", { name: share ? "Card" : "Edit card" });
  return { user, db, editor, labels: within(editor).getByRole("region", { name: "Labels" }) };
}

async function outbox() {
  const db = await localDb(USER);
  return db.outbox.orderBy("seq").toArray();
}

describe("board labels on cards", { timeout: 20_000 }, () => {
  it("chooses labels in the form and writes them with Save", async () => {
    const { user, editor, labels } = await open();
    expect(within(labels).getByRole("button", { name: "Urgent", pressed: true })).toBeInTheDocument();
    await user.click(within(labels).getByRole("button", { name: "Urgent" }));
    await user.click(within(labels).getByRole("button", { name: "Bug" }));
    await user.click(within(editor).getByRole("button", { name: "Save" }));
    await screen.findByText("Saved Plan");
    expect((await outbox()).map((entry) => [entry.entity_type, entry.op, entry.entity_id, entry.data])).toEqual([
      ["item_label", "create", expect.any(String) as unknown, { item_id: PLAN, label_id: BUG }],
      ["item_label", "delete", "il1", undefined],
    ]);
    await waitFor(() => {
      expect(within(screen.getByRole("button", { name: "Open Plan" })).getByText("Bug")).toBeInTheDocument();
    });
    expect(within(screen.getByRole("button", { name: "Open Plan" })).queryByText("Urgent")).not.toBeInTheDocument();
  });

  it("creates a label at once and puts it on the card, refusing a taken name", async () => {
    const { user, editor, labels } = await open();
    await user.click(within(labels).getByRole("button", { name: "New label…" }));
    const dialog = await screen.findByRole("dialog", { name: "New label" });
    await user.type(within(dialog).getByLabelText("Name"), "urgent");
    expect(within(dialog).getByText("This board already has a label with this name.")).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "Create" })).toBeDisabled();
    await user.clear(within(dialog).getByLabelText("Name"));
    await user.type(within(dialog).getByLabelText("Name"), "Release");
    await user.click(within(dialog).getByRole("button", { name: "Create" }));
    await screen.findByText("Label created: Release");
    const [created] = await outbox();
    expect(created).toMatchObject({ entity_type: "label", op: "create", data: { board_id: BOARD, name: "Release" } });
    expect(await within(labels).findByRole("button", { name: "Release", pressed: true })).toBeInTheDocument();
    await user.click(within(editor).getByRole("button", { name: "Save" }));
    await screen.findByText("Saved Plan");
    expect((await outbox())[1]).toMatchObject({
      entity_type: "item_label",
      op: "create",
      data: { item_id: PLAN, label_id: created?.entity_id },
    });
  });

  it("renames and recolours a label and deletes it from the board with Undo", async () => {
    const { user, db, labels } = await open();
    await user.click(within(labels).getByRole("button", { name: "Options for the label Bug" }));
    await user.click(await screen.findByRole("menuitem", { name: "Rename or recolor…" }));
    const dialog = await screen.findByRole("dialog", { name: "Edit label" });
    await user.clear(within(dialog).getByLabelText("Name"));
    await user.type(within(dialog).getByLabelText("Name"), "Defect");
    await user.click(within(dialog).getByRole("radio", { name: "Purple" }));
    await user.click(within(dialog).getByRole("button", { name: "Save" }));
    await screen.findByText("Saved the label Defect");
    expect(await outbox()).toMatchObject([
      { entity_type: "label", entity_id: BUG, op: "update", data: { name: "Defect", color: "purple" } },
    ]);

    // The label dialog has closed and given the editor back.
    await waitFor(() => {
      expect(screen.queryByRole("dialog", { name: "Edit label" })).not.toBeInTheDocument();
    });
    await user.click(within(labels).getByRole("button", { name: "Options for the label Urgent" }));
    await user.click(await screen.findByRole("menuitem", { name: "Delete…" }));
    const ask = await screen.findByRole("dialog", { name: "Delete label?" });
    expect(ask).toHaveTextContent("Delete the label “Urgent” from the board? It comes off 1 card.");
    await user.click(within(ask).getByRole("button", { name: "Delete" }));
    const toast = await screen.findByText("Deleted the label Urgent");
    await waitFor(() => {
      expect(within(labels).queryByRole("button", { name: "Urgent" })).not.toBeInTheDocument();
    });
    await waitFor(() => {
      expect(screen.queryByRole("dialog", { name: "Delete label?" })).not.toBeInTheDocument();
    });
    // The editor (a modal) is closed first: Undo is in the notifications below it.
    await user.click(within(screen.getByRole("dialog", { name: "Edit card" })).getByRole("button", { name: "Save" }));
    await waitFor(() => {
      expect(screen.queryByRole("dialog", { name: "Edit card" })).not.toBeInTheDocument();
    });
    // The label came off the card with its own delete: Save writes nothing more about it.
    expect((await outbox()).map((entry) => [entry.entity_type, entry.op])).toEqual([
      ["label", "update"],
      ["label", "delete"],
    ]);
    await user.click(within(toast.closest("li") ?? document.body).getByRole("button", { name: "Undo" }));
    await waitFor(async () => {
      expect((await db.labels.get(URGENT))?.deleted_at).toBeFalsy();
    });
  });

  it("changes nothing for a view share", async () => {
    const { labels } = await open(
      { owner_id: "someone-else" },
      {
        id: "s1",
        container_kind: "board",
        container_id: BOARD,
        grantee_id: USER,
        permission: "view",
        revoked_at: null,
      },
    );
    expect(within(labels).getByRole("button", { name: "Bug" })).toBeDisabled();
    expect(within(labels).queryByRole("button", { name: "New label…" })).not.toBeInTheDocument();
    expect(within(labels).queryByRole("button", { name: /^Options for the label/ })).not.toBeInTheDocument();
  });
});
