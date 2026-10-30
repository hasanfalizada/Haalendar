// +++===+++ 2026-10-30 — Hasan Alizada — HAAL-120. Links in the interface (FR-INT-01, D-98): the card editor lists its
// links (a backlink is the same link from the other side), one in the trash greyed, one closed to the user as "Item you
// can't open"; "Add link…" finds items by title and links several at once with Undo; Remove takes a link off; a linked
// item opens where it lives; a view share changes nothing.
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { localDb } from "@/sync/db";

import { json, me, renderApp, stubApi } from "./fake-api";

const USER = me().id;
const BOARD = "0199f000-0000-7000-8000-0000000000b1";
const TODO = "0199f000-0000-7000-8000-0000000000d1";
const PLAN = "0199f000-0000-7000-8000-0000000000e1";
const SHOPPING = "0199f000-0000-7000-8000-0000000000e2";
const DENTIST = "0199f000-0000-7000-8000-0000000000e3";
const OLD = "0199f000-0000-7000-8000-0000000000e4";
const CLOSED = "0199f000-0000-7000-8000-0000000000e5";

const base = { body: "", color: "green", priority: "medium", deleted_at: null, version: 2 };

const link = (id: string, from: string, to: string) => ({
  id,
  from_item_id: from,
  to_item_id: to,
  container_kind: "board",
  container_id: BOARD,
  to_container_kind: "note",
  to_container_id: to,
  origin: "manual",
  deleted_at: null,
  version: 1,
});

async function open(options: { owner?: string; share?: Record<string, unknown>; path?: string } = {}) {
  const db = await localDb(USER);
  await db.boards.put({
    id: BOARD,
    owner_id: options.owner ?? USER,
    name: "Revamp",
    position: "U",
    archived_at: null,
    deleted_at: null,
    version: 2,
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
  await db.items.bulkPut([
    {
      ...base,
      id: PLAN,
      kind: "card",
      container_kind: "board",
      container_id: BOARD,
      column_id: TODO,
      title: "Plan",
      position: "C",
    },
    {
      ...base,
      id: SHOPPING,
      kind: "note",
      container_kind: "note",
      container_id: SHOPPING,
      owner_id: USER,
      title: "Shopping",
      pinned: false,
      archived_at: null,
      position: "U",
      is_checklist: false,
    },
    {
      ...base,
      id: DENTIST,
      kind: "event",
      container_kind: "calendar",
      container_id: "cal",
      title: "Dentist",
      start_date: "2026-11-10",
    },
    {
      ...base,
      id: OLD,
      kind: "note",
      container_kind: "note",
      container_id: OLD,
      owner_id: USER,
      title: "Old idea",
      pinned: false,
      archived_at: null,
      position: "V",
      is_checklist: false,
      deleted_at: "2026-10-20T10:00:00Z",
    },
  ]);
  await db.links.bulkPut([link("l1", PLAN, SHOPPING), link("l2", OLD, PLAN), link("l3", PLAN, CLOSED)]);
  if (options.share) await db.shares.put(options.share);
  stubApi({ "GET /me": () => json(me()), "POST /sync/push": () => new Promise<Response>(() => undefined) });
  const { router } = renderApp(options.path ?? `/kanban/${BOARD}`);
  await screen.findByRole("button", { name: /Account menu/ });
  return { user: userEvent.setup(), db, router };
}

async function outbox() {
  const db = await localDb(USER);
  return db.outbox.orderBy("seq").toArray();
}

const section = (dialog: HTMLElement) => within(dialog).getByRole("region", { name: "Links" });

describe("links between items", { timeout: 20_000 }, () => {
  it("lists a card's links, links more with Undo and removes one", async () => {
    const { user } = await open();
    await user.click(await screen.findByRole("button", { name: "Open Plan" }));
    const editor = await screen.findByRole("dialog", { name: "Edit card" });
    const links = section(editor);
    const rows = within(links)
      .getAllByRole("listitem")
      .map((li) => li.textContent);
    expect(rows).toEqual(["Shopping", "Old idea(in the trash)", "Item you can't open"]);

    await user.click(within(links).getByRole("button", { name: "Add link…" }));
    const picker = await screen.findByRole("dialog", { name: "Link to Plan" });
    // The card itself and what is linked already (also the note in the trash) are not offered.
    expect(within(picker).getAllByRole("checkbox")).toHaveLength(1);
    await user.type(within(picker).getByLabelText("Search events, notes and cards"), "dent{Enter}");
    await user.click(within(picker).getByRole("checkbox"));
    await user.click(within(picker).getByRole("button", { name: "Link 1 item" }));
    const toast = await screen.findByText("Linked 1 item to Plan");
    // Enter in the search did not submit the card editor.
    expect(screen.getByRole("dialog", { name: "Edit card" })).toBeInTheDocument();
    await waitFor(() => {
      expect(within(section(editor)).getByRole("button", { name: "Dentist" })).toBeInTheDocument();
    });
    const [created] = await outbox();
    expect(created).toMatchObject({
      entity_type: "link",
      op: "create",
      data: { from_item_id: PLAN, to_item_id: DENTIST },
    });

    // The modal editor keeps the page inert; the message's Undo is pressed directly.
    fireEvent.click(within(toast.closest("li") ?? document.body).getByRole("button", { name: "Undo" }));
    await waitFor(() => {
      expect(within(section(editor)).queryByRole("button", { name: "Dentist" })).not.toBeInTheDocument();
    });
    await user.click(within(section(editor)).getByRole("button", { name: "Remove the link to Shopping" }));
    await screen.findByText("Removed the link to Shopping");
    expect((await outbox()).at(-1)).toMatchObject({ entity_type: "link", entity_id: "l1", op: "delete" });
  });

  it("shows the link from the other side and opens the linked item where it lives", async () => {
    const { user, router } = await open({ path: `/todo?note=${SHOPPING}` });
    const editor = await screen.findByRole("dialog", { name: "Edit note" });
    await user.click(await within(section(editor)).findByRole("button", { name: "Plan" }));
    expect(await screen.findByRole("dialog", { name: "Edit card" })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe(`/kanban/${BOARD}`);
  });

  it("lets a view share follow links but change none", async () => {
    const { user } = await open({
      owner: "someone-else",
      share: {
        id: "s1",
        container_kind: "board",
        container_id: BOARD,
        grantee_id: USER,
        permission: "view",
        revoked_at: null,
      },
    });
    await user.click(await screen.findByRole("button", { name: "Open Plan" }));
    const viewer = await screen.findByRole("dialog", { name: "Card" });
    expect(within(section(viewer)).getByRole("button", { name: "Shopping" })).toBeInTheDocument();
    expect(within(section(viewer)).queryByRole("button", { name: "Add link…" })).not.toBeInTheDocument();
    expect(within(section(viewer)).queryByRole("button", { name: /^Remove the link/ })).not.toBeInTheDocument();
  });
});
