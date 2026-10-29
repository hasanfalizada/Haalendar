// +++===+++ 2026-10-29 — Hasan Alizada — HAAL-110. Kanban boards (FR-KAN-01, D-90): the boards page lists own boards in
// their order, boards shared with the user (owner named) and the archive (folded); New board writes the board after the
// last one and opens it; the board page renames, archives (read-only notice, Unarchive) and deletes (confirmation, back
// to all boards, Undo) through sync; a grantee only leaves; a board that is not there says so.
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { comparePositions } from "@/lib/position";
import { localDb } from "@/sync/db";

import { json, me, renderApp, stubApi } from "./fake-api";

const USER = me().id;
const REVAMP = "0199f000-0000-7000-8000-0000000000b1";
const HOME = "0199f000-0000-7000-8000-0000000000b2";
const OLD = "0199f000-0000-7000-8000-0000000000b3";
const BOBS = "0199f000-0000-7000-8000-0000000000b4";
const GONE = "0199f000-0000-7000-8000-0000000000b5";

const board = (id: string, name: string, extra: Record<string, unknown> = {}) => ({
  id,
  owner_id: USER,
  name,
  position: "U",
  archived_at: null,
  deleted_at: null,
  version: 2,
  ...extra,
});

const share = {
  id: "0199f000-0000-7000-8000-0000000000s2",
  container_kind: "board",
  container_id: BOBS,
  container_name: "Bob's plans",
  grantee_id: USER,
  grantee_name: "Ada",
  grantee_email: "ada@example.org",
  owner_id: "someone-else",
  owner_name: "Bob",
  permission: "edit",
  granted_by: "someone-else",
  created_at: "2026-10-01T00:00:00Z",
  revoked_at: null,
  version: 1,
};

async function open(path = "/kanban", extra: Parameters<typeof stubApi>[0] = {}) {
  const db = await localDb(USER);
  await db.boards.bulkPut([
    board(REVAMP, "Revamp", { position: "M" }),
    board(HOME, "Home", { position: "C" }),
    board(OLD, "Old plans", { archived_at: "2026-10-01T10:00:00Z", position: "Z" }),
    board(BOBS, "Bob's plans", { owner_id: "someone-else" }),
    board(GONE, "Deleted one", { deleted_at: "2026-10-02T10:00:00Z" }),
  ]);
  // Pushes never answer here, so the outbox keeps what the page wrote.
  stubApi({
    "GET /me": () => json(me()),
    "POST /sync/push": () => new Promise<Response>(() => undefined),
    "GET /shares": () => json({ data: [share] }),
    ...extra,
  });
  const { router } = renderApp(path);
  await screen.findByRole("button", { name: /Account menu/ });
  return { user: userEvent.setup(), db, router };
}

async function outbox() {
  const db = await localDb(USER);
  return db.outbox.orderBy("seq").toArray();
}

const tiles = (region: HTMLElement) =>
  within(region)
    .getAllByRole("link")
    .map((link) => link.textContent);

describe("Kanban boards", { timeout: 20_000 }, () => {
  it("lists own boards in order, shared ones with their owner and the archive", async () => {
    await open();
    expect(tiles(await screen.findByRole("region", { name: "My boards" }))).toEqual(["Home", "Revamp"]);
    const shared = screen.getByRole("region", { name: "Shared with me" });
    expect(await within(shared).findByText("Shared by Bob")).toBeInTheDocument();
    expect(within(shared).getByRole("link", { name: /Bob's plans/ })).toHaveAttribute("href", `/kanban/${BOBS}`);
    expect(screen.getByText("Archived (1)")).toBeInTheDocument();
    expect(screen.queryByText("Deleted one")).not.toBeInTheDocument();
  });

  it("creates a board after the last one and opens it", async () => {
    const { user, router } = await open();
    await user.click(await screen.findByRole("button", { name: "New board" }));
    const dialog = await screen.findByRole("dialog", { name: "New board" });
    expect(within(dialog).getByRole("button", { name: "Create" })).toBeDisabled();
    await user.type(within(dialog).getByLabelText("Name"), "  Garden  {Enter}");
    await screen.findByText("Board created: Garden");
    const [entry] = await outbox();
    expect(entry).toMatchObject({ entity_type: "board", op: "create", data: { name: "Garden" } });
    // After every own board, archived ones too.
    expect(comparePositions(String(entry?.data?.position), "Z")).toBe(1);
    await waitFor(() => {
      expect(router.state.location.pathname).toBe(`/kanban/${String(entry?.entity_id)}`);
    });
    expect(await screen.findByRole("heading", { name: "Garden", level: 1 })).toBeInTheDocument();
    expect(screen.getByText("No columns yet")).toBeInTheDocument();
    // Before the server has it, it is already the user's own and stands last.
    await user.click(screen.getByRole("link", { name: "All boards" }));
    await waitFor(() => {
      expect(tiles(screen.getByRole("region", { name: "My boards" }))).toEqual(["Home", "Revamp", "Garden"]);
    });
  });

  it("renames, archives and unarchives a board from its menu", async () => {
    const { user } = await open(`/kanban/${REVAMP}`);
    await screen.findByRole("heading", { name: "Revamp", level: 1 });
    await user.click(screen.getByRole("button", { name: "Options for Revamp" }));
    await user.click(await screen.findByRole("menuitem", { name: "Rename…" }));
    const dialog = await screen.findByRole("dialog", { name: "Rename board" });
    const field = within(dialog).getByLabelText("Name");
    await user.clear(field);
    await user.type(field, "Kanban revamp{Enter}");
    await screen.findByText("Renamed to Kanban revamp");
    expect(await screen.findByRole("heading", { name: "Kanban revamp", level: 1 })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Options for Kanban revamp" }));
    await user.click(await screen.findByRole("menuitem", { name: "Archive" }));
    expect(await screen.findByText("This board is archived and read-only.")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Unarchive" }));
    await waitFor(() => {
      expect(screen.queryByText("This board is archived and read-only.")).not.toBeInTheDocument();
    });
    // The waiting changes of one board merge into one: renamed, archived and unarchived again.
    const writes = (await outbox()).map((entry) => [entry.entity_type, entry.op, entry.data]);
    expect(writes).toEqual([["board", "update", { name: "Kanban revamp", archived_at: null }]]);
  });

  it("deletes a board after a confirmation naming its cards, goes back and can undo", async () => {
    const { user, router, db } = await open(`/kanban/${REVAMP}`);
    await db.items.put({
      id: "0199f000-0000-7000-8000-0000000000c1",
      kind: "card",
      container_kind: "board",
      container_id: REVAMP,
      title: "Plan",
      deleted_at: null,
    });
    await screen.findByRole("heading", { name: "Revamp", level: 1 });
    await user.click(screen.getByRole("button", { name: "Options for Revamp" }));
    await user.click(await screen.findByRole("menuitem", { name: "Delete…" }));
    const confirm = await screen.findByRole("dialog", { name: "Delete board?" });
    expect(confirm).toHaveTextContent("Delete “Revamp”? Its 1 card goes to the trash with it.");
    await user.click(within(confirm).getByRole("button", { name: "Delete" }));
    const toast = await screen.findByText("Deleted Revamp");
    await waitFor(() => {
      expect(router.state.location.pathname).toBe("/kanban");
    });
    expect(tiles(await screen.findByRole("region", { name: "My boards" }))).toEqual(["Home"]);
    await user.click(within(toast.closest("li") ?? document.body).getByRole("button", { name: "Undo" }));
    await waitFor(async () => {
      expect((await db.boards.get(REVAMP))?.deleted_at).toBeFalsy();
    });
  });

  it("lets a grantee leave a shared board, and says when a board is not there", async () => {
    let left = false;
    const { user, router } = await open(`/kanban/${BOBS}`, {
      "DELETE /shares/*": () => {
        left = true;
        return new Response(null, { status: 204 });
      },
    });
    await screen.findByRole("heading", { name: "Bob's plans", level: 1 });
    expect(await screen.findByText("Shared by Bob")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Options for Bob's plans" }));
    const menu = await screen.findByRole("menu");
    expect(
      within(menu)
        .getAllByRole("menuitem")
        .map((item) => item.textContent),
    ).toEqual(["Leave"]);
    await user.click(within(menu).getByRole("menuitem", { name: "Leave" }));
    await screen.findByText("You left “Bob's plans”.");
    expect(left).toBe(true);
    await waitFor(() => {
      expect(router.state.location.pathname).toBe("/kanban");
    });

    await router.navigate({ to: "/kanban/$boardId", params: { boardId: GONE } });
    expect(await screen.findByRole("heading", { name: "Board not found" })).toBeInTheDocument();
  });
});
