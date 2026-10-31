// +++===+++ 2026-10-29 — Hasan Alizada — HAAL-100. The To-Do page (FR-TODO-01/03, D-87): notes from the local database,
// Pinned before Others by position, the archive tab, the priority filter in the address; a new note on top through the
// editor (title or text needed, Ctrl+Enter saves); editing writes the changed fields only; pin, colour (one write when
// the palette closes), archive and delete from the card with undo; the calendar never shows notes.
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { comparePositions } from "@/lib/position";
import { localChanged } from "@/sync";
import { localDb } from "@/sync/db";

import { json, me, renderApp, stubApi } from "./fake-api";

const USER = me().id;
const SHOPPING = "0199f000-0000-7000-8000-0000000000a1";
const IDEAS = "0199f000-0000-7000-8000-0000000000a2";
const OLD = "0199f000-0000-7000-8000-0000000000a3";
const BOOKS = "0199f000-0000-7000-8000-0000000000a4";
const GONE = "0199f000-0000-7000-8000-0000000000a5";

const note = (id: string, title: string, extra: Record<string, unknown> = {}) => ({
  id,
  kind: "note",
  container_kind: "note",
  container_id: id,
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

async function open(path = "/todo") {
  const db = await localDb(USER);
  await db.items.bulkPut([
    note(SHOPPING, "Shopping", { body: "- milk\n- **bread**", position: "M", color: "yellow" }),
    note(IDEAS, "Ideas", { pinned: true, position: "Z", priority: "high" }),
    note(BOOKS, "", { body: "Books to read: Dune", position: "A" }),
    note(OLD, "Old plans", { archived_at: "2026-10-01T10:00:00Z", position: "B" }),
    note(GONE, "Deleted one", { deleted_at: "2026-10-02T10:00:00Z" }),
  ]);
  // Pushes never answer here, so the outbox keeps what the page wrote.
  stubApi({ "GET /me": () => json(me()), "POST /sync/push": () => new Promise<Response>(() => undefined) });
  const { router } = renderApp(path);
  await screen.findByRole("button", { name: /Account menu/ });
  return { user: userEvent.setup(), db, router };
}

async function outbox() {
  const db = await localDb(USER);
  return db.outbox.orderBy("seq").toArray();
}

const cardNames = (scope: HTMLElement) =>
  within(scope)
    .getAllByRole("article")
    .map((card) => card.getAttribute("aria-label"));

describe("To-Do notes", { timeout: 20_000 }, () => {
  it("shows Pinned before Others by position, the archive on its tab and filters by priority", async () => {
    const { user, router } = await open();
    const pinned = await screen.findByRole("region", { name: "Pinned" });
    expect(cardNames(pinned)).toEqual(["Ideas"]);
    // A note without a title is named by the start of its text.
    expect(cardNames(screen.getByRole("region", { name: "Others" }))).toEqual(["Books to read: Dune", "Shopping"]);
    expect(screen.getByRole("button", { name: "Open Shopping" })).toHaveTextContent("Shoppingmilk bread");
    expect(screen.queryByText("Old plans")).not.toBeInTheDocument();
    expect(screen.queryByText("Deleted one")).not.toBeInTheDocument();

    await user.click(screen.getByRole("radio", { name: "Archive" }));
    await waitFor(() => {
      expect(router.state.location.search).toMatchObject({ tab: "archive" });
    });
    expect(cardNames(await screen.findByRole("region", { name: "Archive" }))).toEqual(["Old plans"]);
    expect(screen.getByRole("button", { name: "Unarchive Old plans" })).toBeInTheDocument();

    await user.click(screen.getByRole("radio", { name: "Notes" }));
    await user.click(await screen.findByRole("button", { name: "High" }));
    await waitFor(() => {
      expect(router.state.location.search).toMatchObject({ priority: "high" });
    });
    expect(screen.getAllByRole("article").map((card) => card.getAttribute("aria-label"))).toEqual(["Ideas"]);
  });

  it("an empty page invites the first note", async () => {
    stubApi({ "GET /me": () => json(me()) });
    renderApp("/todo");
    expect(await screen.findByRole("heading", { name: "Write your first note" })).toBeInTheDocument();
  });

  it("a new note goes on top; it needs a title or text; Ctrl+Enter saves; undo removes it", async () => {
    const { user, db } = await open();
    await user.click(await screen.findByRole("button", { name: "New note" }));
    const editor = await screen.findByRole("dialog", { name: "New note" });
    const save = within(editor).getByRole("button", { name: "Save" });
    expect(save).toBeDisabled();
    await user.type(within(editor).getByLabelText("Title"), "Call mum");
    await user.keyboard("{Control>}{Enter}{/Control}");
    await waitFor(() => {
      expect(screen.queryByRole("dialog", { name: "New note" })).not.toBeInTheDocument();
    });
    const [created] = await outbox();
    expect(created).toMatchObject({ entity_type: "item", op: "create" });
    expect(created?.data).toMatchObject({ kind: "note", title: "Call mum", pinned: false, priority: "medium" });
    const position = String(created?.data?.position);
    expect(comparePositions(position, "A")).toBeLessThan(0);
    expect(cardNames(await screen.findByRole("region", { name: "Others" }))[0]).toBe("Call mum");

    const toast = await screen.findByText("Created Call mum");
    await user.click(within(toast.closest("li") ?? document.body).getByRole("button", { name: "Undo" }));
    await waitFor(async () => {
      expect((await db.items.get(String(created?.entity_id)))?.deleted_at).toBeTruthy();
    });
  });

  it("editing writes only the changed fields with their old values as base", async () => {
    const { user, db } = await open();
    await user.click(await screen.findByRole("button", { name: "Open Shopping" }));
    const editor = await screen.findByRole("dialog", { name: "Edit note" });
    expect(within(editor).getByLabelText("Title")).toHaveValue("Shopping");
    await user.clear(within(editor).getByLabelText("Title"));
    await user.type(within(editor).getByLabelText("Title"), "Groceries");
    await user.click(within(editor).getByRole("radio", { name: "Green" }));
    await user.click(within(editor).getByRole("button", { name: "Save" }));
    await screen.findByText("Saved Groceries");
    expect(await outbox()).toMatchObject([
      {
        entity_id: SHOPPING,
        op: "update",
        base_version: 3,
        base: { title: "Shopping", color: "yellow" },
        data: { title: "Groceries", color: "green" },
      },
    ]);
    expect((await db.items.get(SHOPPING))?.title).toBe("Groceries");
  });

  // +++===+++ 2026-10-31 — Hasan Alizada — HAAL-141. A note made on this device that the server has not received yet
  // (version 0) has no attachments there: the editor waits instead of asking (it got 404 before).
  it("asks for the attachments only once the note is on the server", async () => {
    const db = await localDb(USER);
    await db.items.put(note(SHOPPING, "Fresh", { version: 0 }));
    const calls = stubApi({
      "GET /me": () => json(me()),
      "POST /sync/push": () => new Promise<Response>(() => undefined),
      [`GET /items/${SHOPPING}/attachments`]: () => json({ data: [] }),
    });
    renderApp("/todo");
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: "Open Fresh" }));
    const editor = await screen.findByRole("dialog", { name: "Edit note" });
    expect(within(editor).getByText("Images can be added once the note has reached the server.")).toBeVisible();
    expect(calls.some((c) => c.path.endsWith("/attachments"))).toBe(false);

    await db.items.update(SHOPPING, { version: 1 });
    localChanged(USER);
    await waitFor(() => {
      expect(calls.some((c) => c.path === `/items/${SHOPPING}/attachments`)).toBe(true);
    });
  });

  it("pin, colour, archive and delete from the card, each with undo", async () => {
    const { user, db } = await open();
    await user.click(await screen.findByRole("button", { name: "Pin Shopping" }));
    await waitFor(() => {
      expect(cardNames(screen.getByRole("region", { name: "Pinned" }))).toEqual(["Shopping", "Ideas"]);
    });

    await user.click(screen.getByRole("button", { name: "Color of Books to read: Dune" }));
    await user.click(await screen.findByRole("radio", { name: "Blue" }));
    await user.click(screen.getByRole("radio", { name: "Purple" }));
    await user.keyboard("{Escape}");
    await screen.findByText("Changed the color of Books to read: Dune");

    await user.click(screen.getByRole("button", { name: "Archive Ideas" }));
    await screen.findByText("Archived Ideas");
    // The list follows the local write a moment after the notification.
    await waitFor(() => {
      expect(screen.queryByRole("article", { name: "Ideas" })).not.toBeInTheDocument();
    });

    await user.click(screen.getByRole("button", { name: "Delete Shopping" }));
    const deleted = await screen.findByText("Deleted Shopping — it is in the trash");
    // The list follows the local write a moment after the notification.
    await waitFor(() => {
      expect(screen.queryByRole("article", { name: "Shopping" })).not.toBeInTheDocument();
    });

    expect(await outbox()).toMatchObject([
      { entity_id: SHOPPING, op: "update", base: { pinned: false }, data: { pinned: true } },
      { entity_id: BOOKS, op: "update", base: { color: "brown" }, data: { color: "purple" } },
      { entity_id: IDEAS, op: "update", base: { archived_at: null } },
      { entity_id: SHOPPING, op: "delete" },
    ]);
    expect((await outbox())[2]?.data?.archived_at).toEqual(expect.any(String));

    await user.click(within(deleted.closest("li") ?? document.body).getByRole("button", { name: "Undo" }));
    expect(await screen.findByRole("article", { name: "Shopping" })).toBeInTheDocument();
    expect((await db.items.get(SHOPPING))?.deleted_at).toBeFalsy();
  });

  it("the calendar never shows notes", async () => {
    await open("/calendar?date=2026-10-29&view=day");
    expect(screen.queryByText("Shopping")).not.toBeInTheDocument();
  });
});
