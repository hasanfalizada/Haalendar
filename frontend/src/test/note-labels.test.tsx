// +++===+++ 2026-11-17 22:40 +04 — Hasan Alizada — HAAL-102. Personal labels of notes (FR-TODO-04, D-109): chips on the
// cards; the Labels menu filters by any of the checked labels (`?labels=`, both tabs, a label that is gone no longer
// filters) and holds only the user's labels; the note editor chooses them and writes them with Save as one step, on a
// note shared for viewing too; "New label…" makes a label without a board; at most 20 on a note; Manage labels renames
// and deletes (naming the notes it is on, Undo); a draft kept before labels existed is restored.
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { saveDraft } from "@/lib/drafts";
import { localDb } from "@/sync/db";

import { json, me, noPush, renderApp, stubApi } from "./fake-api";

const USER = me().id;
const SHOPPING = "0199f000-0000-7000-8000-0000000000a1";
const IDEAS = "0199f000-0000-7000-8000-0000000000a2";
const OLD = "0199f000-0000-7000-8000-0000000000a3";
const SHARED = "0199f000-0000-7000-8000-0000000000a4";
const HOME = "0199f000-0000-7000-8000-0000000000c1";
const WORK = "0199f000-0000-7000-8000-0000000000c2";
const BOARD_LABEL = "0199f000-0000-7000-8000-0000000000c3";
const GONE = "0199f000-0000-7000-8000-0000000000c4";

const note = (id: string, title: string, extra: Record<string, unknown> = {}) => ({
  id,
  kind: "note",
  container_kind: "note",
  container_id: id,
  owner_id: USER,
  title,
  body: "",
  color: "brown",
  priority: "medium",
  pinned: false,
  archived_at: null,
  position: "U",
  deleted_at: null,
  version: 3,
  ...extra,
});

const personal = (id: string, name: string, color: string, extra: Record<string, unknown> = {}) => ({
  id,
  board_id: null,
  container_kind: "user",
  container_id: USER,
  name,
  color,
  deleted_at: null,
  version: 1,
  ...extra,
});

const on = (id: string, item: string, label: string) => ({
  id,
  item_id: item,
  label_id: label,
  container_kind: "user",
  container_id: USER,
  deleted_at: null,
  version: 1,
});

async function open(path = "/todo", seed?: (db: Awaited<ReturnType<typeof localDb>>) => Promise<void>) {
  const db = await localDb(USER);
  await db.items.bulkPut([
    note(SHOPPING, "Shopping", { position: "M" }),
    note(IDEAS, "Ideas", { position: "Z" }),
    note(OLD, "Old plans", { archived_at: "2026-10-01T10:00:00Z", position: "B" }),
  ]);
  await db.labels.bulkPut([
    personal(HOME, "Home", "green"),
    personal(WORK, "Work", "blue"),
    personal(GONE, "Gone", "red", { deleted_at: "2026-11-01T10:00:00Z" }),
    // A board's label is not one of the user's labels of notes.
    {
      id: BOARD_LABEL,
      board_id: "0199f000-0000-7000-8000-0000000000b1",
      container_kind: "board",
      container_id: "0199f000-0000-7000-8000-0000000000b1",
      name: "Urgent",
      color: "red",
      deleted_at: null,
    },
  ]);
  await db.itemLabels.bulkPut([on("il1", SHOPPING, HOME), on("il2", IDEAS, WORK), on("il3", OLD, HOME)]);
  await seed?.(db);
  // Pushes never answer here, so the outbox keeps what the page wrote.
  stubApi({ "GET /me": () => json(me()), "POST /sync/push": noPush });
  const { router } = renderApp(path);
  await screen.findByRole("button", { name: /Account menu/ });
  return { user: userEvent.setup(), db, router };
}

async function outbox() {
  const db = await localDb(USER);
  return db.outbox.orderBy("seq").toArray();
}

const shown = () => screen.getAllByRole("article").map((card) => card.getAttribute("aria-label"));

async function editorOf(user: ReturnType<typeof userEvent.setup>, title: string) {
  await user.click(await screen.findByRole("button", { name: `Open ${title}` }));
  const editor = await screen.findByRole("dialog", { name: /note|Note/ });
  return { editor, labels: within(editor).getByRole("region", { name: "Labels" }) };
}

describe("labels of notes", { timeout: 20_000 }, () => {
  it("shows them on the cards and filters by any of the checked ones on both tabs", async () => {
    const { user, router } = await open();
    expect(await screen.findByRole("button", { name: "Open Shopping" })).toHaveTextContent("Labels: HomeShopping");

    await user.click(screen.getByRole("button", { name: "Labels" }));
    const menu = await screen.findByRole("menu");
    // The user's live labels only: not a deleted one, not a board's.
    expect(
      within(menu)
        .getAllByRole("menuitemcheckbox")
        .map((item) => item.textContent),
    ).toEqual(["Home", "Work"]);
    await user.click(within(menu).getByRole("menuitemcheckbox", { name: "Home" }));
    await waitFor(() => {
      expect(router.state.location.search).toMatchObject({ labels: HOME });
    });
    // The menu of checkboxes stays open for more choices (and hides the page meanwhile).
    await user.keyboard("{Escape}");
    await waitFor(() => {
      expect(shown()).toEqual(["Shopping"]);
    });
    expect(screen.getByRole("button", { name: "Labels (1)" })).toBeInTheDocument();

    await user.click(screen.getByRole("radio", { name: "Archive" }));
    await waitFor(() => {
      expect(router.state.location.search).toMatchObject({ tab: "archive", labels: HOME });
    });
    await waitFor(() => {
      expect(shown()).toEqual(["Old plans"]);
    });
  });

  it("a label that is gone no longer filters", async () => {
    await open(`/todo?labels=${GONE}`);
    await screen.findByRole("button", { name: "Open Shopping" });
    expect(shown().sort()).toEqual(["Ideas", "Shopping"]);
    expect(screen.getByRole("button", { name: "Labels" })).toBeInTheDocument();
  });

  it("an empty filter result says so", async () => {
    await open(`/todo?labels=${WORK}&priority=high`);
    expect(await screen.findByRole("heading", { name: "No notes match the filter" })).toBeInTheDocument();
  });

  it("chooses labels in the editor and writes them with Save as one step", async () => {
    const { user, db } = await open();
    const { editor, labels } = await editorOf(user, "Shopping");
    expect(within(labels).getByRole("button", { name: "Home", pressed: true })).toBeInTheDocument();
    expect(within(labels).queryByRole("button", { name: "Urgent" })).not.toBeInTheDocument();
    await user.click(within(labels).getByRole("button", { name: "Home" }));
    await user.click(within(labels).getByRole("button", { name: "Work" }));
    await user.click(within(editor).getByRole("button", { name: "Save" }));
    const toast = await screen.findByText("Saved Shopping");
    expect((await outbox()).map((entry) => [entry.entity_type, entry.op, entry.entity_id, entry.data])).toEqual([
      ["item_label", "create", expect.any(String) as unknown, { item_id: SHOPPING, label_id: WORK }],
      ["item_label", "delete", "il1", undefined],
    ]);
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Open Shopping" })).toHaveTextContent("Labels: WorkShopping");
    });

    await user.click(within(toast.closest("li") ?? document.body).getByRole("button", { name: "Undo" }));
    await waitFor(async () => {
      expect((await db.itemLabels.get("il1"))?.deleted_at).toBeFalsy();
    });
  });

  it("a new label has no board and goes on the note with Save", async () => {
    const { user } = await open();
    const { editor, labels } = await editorOf(user, "Ideas");
    await user.click(within(labels).getByRole("button", { name: "New label…" }));
    const dialog = await screen.findByRole("dialog", { name: "New label" });
    await user.type(within(dialog).getByLabelText("Name"), "home");
    expect(within(dialog).getByText("You already have a label with this name.")).toBeInTheDocument();
    await user.clear(within(dialog).getByLabelText("Name"));
    await user.type(within(dialog).getByLabelText("Name"), "Trips");
    await user.click(within(dialog).getByRole("button", { name: "Create" }));
    await screen.findByText("Label created: Trips");
    const [created] = await outbox();
    expect(created).toMatchObject({ entity_type: "label", op: "create", data: { name: "Trips", color: "blue" } });
    expect(created?.data).not.toHaveProperty("board_id");
    expect(await within(labels).findByRole("button", { name: "Trips", pressed: true })).toBeInTheDocument();
    await user.click(within(editor).getByRole("button", { name: "Save" }));
    await screen.findByText("Saved Ideas");
    expect((await outbox())[1]).toMatchObject({
      entity_type: "item_label",
      op: "create",
      data: { item_id: IDEAS, label_id: created?.entity_id },
    });
  });

  it("labels a note shared for viewing: nobody else sees them", async () => {
    const { user } = await open("/todo", async (db) => {
      await db.items.put(note(SHARED, "Their trip", { owner_id: "someone-else", position: "C" }));
      await db.shares.put({
        id: "s1",
        container_kind: "note",
        container_id: SHARED,
        grantee_id: USER,
        permission: "view",
        revoked_at: null,
        deleted_at: null,
      });
    });
    const { editor, labels } = await editorOf(user, "Their trip");
    expect(within(editor).getByLabelText("Title")).toBeDisabled();
    await user.click(within(labels).getByRole("button", { name: "Work" }));
    await user.click(within(editor).getByRole("button", { name: "Save" }));
    await screen.findByText("Saved Their trip");
    expect((await outbox()).map((entry) => [entry.entity_type, entry.op, entry.data])).toEqual([
      ["item_label", "create", { item_id: SHARED, label_id: WORK }],
    ]);
  });

  it("holds at most 20 of the user's labels on a note", async () => {
    const many = Array.from(
      { length: 21 },
      (_, n) => `0199f000-0000-7000-8000-0000000001${String(n).padStart(2, "0")}`,
    );
    const { user } = await open("/todo", async (db) => {
      await db.labels.bulkPut(many.map((id, n) => personal(id, `L${String(n).padStart(2, "0")}`, "gray")));
      await db.itemLabels.delete("il2");
      await db.itemLabels.bulkPut(many.slice(0, 20).map((id, n) => on(`full${String(n)}`, IDEAS, id)));
    });
    const { labels } = await editorOf(user, "Ideas");
    expect(within(labels).getByText("A note holds at most 20 of your labels.")).toBeInTheDocument();
    expect(within(labels).getByRole("button", { name: "L20" })).toBeDisabled();
    // One taken off frees a place.
    await user.click(within(labels).getByRole("button", { name: "L00" }));
    expect(within(labels).getByRole("button", { name: "L20" })).toBeEnabled();
  });

  it("Manage labels renames one and deletes one with Undo", async () => {
    const { user, db } = await open();
    await user.click(await screen.findByRole("button", { name: "Labels" }));
    await user.click(await screen.findByRole("menuitem", { name: "Manage labels…" }));
    const manage = await screen.findByRole("dialog", { name: "Labels" });
    await user.click(within(manage).getByRole("button", { name: "Rename or recolor Work" }));
    const dialog = await screen.findByRole("dialog", { name: "Edit label" });
    await user.clear(within(dialog).getByLabelText("Name"));
    await user.type(within(dialog).getByLabelText("Name"), "Office");
    await user.click(within(dialog).getByRole("button", { name: "Save" }));
    await screen.findByText("Saved the label Office");
    expect(await within(manage).findByText("Office")).toBeInTheDocument();

    await user.click(within(manage).getByRole("button", { name: "Delete Home" }));
    const ask = await screen.findByRole("dialog", { name: "Delete label?" });
    expect(ask).toHaveTextContent("Delete the label “Home”? It comes off 2 notes. It can be undone.");
    await user.click(within(ask).getByRole("button", { name: "Delete" }));
    const toast = await screen.findByText("Deleted the label Home");
    expect((await outbox()).map((entry) => [entry.entity_type, entry.op, entry.entity_id])).toEqual([
      ["label", "update", WORK],
      ["label", "delete", HOME],
    ]);
    // The footer's Close (the corner has one too).
    await user.click(within(manage).getAllByRole("button", { name: "Close" }).at(-1) ?? manage);
    await waitFor(() => {
      expect(screen.queryByRole("dialog", { name: "Labels" })).not.toBeInTheDocument();
    });
    await user.click(within(toast.closest("li") ?? document.body).getByRole("button", { name: "Undo" }));
    await waitFor(async () => {
      expect((await db.labels.get(HOME))?.deleted_at).toBeFalsy();
    });
  });

  // A draft kept before the editor had labels lacks the field: restoring it used to break the editor.
  it("restores a draft kept before labels existed", async () => {
    await saveDraft(USER, `note:${SHOPPING}`, {
      title: "Shopping list",
      body: "",
      color: "brown",
      priority: "medium",
      is_checklist: "false",
      checklist: "[]",
      reminders: "",
    });
    const { user } = await open();
    const { editor, labels } = await editorOf(user, "Shopping");
    await user.click(await within(editor).findByRole("button", { name: "Restore" }));
    expect(within(editor).getByLabelText("Title")).toHaveValue("Shopping list");
    expect(within(labels).getByRole("button", { name: "Home", pressed: true })).toBeInTheDocument();
  });
});
