// +++===+++ 2026-10-29 — Hasan Alizada — HAAL-111. Columns on the board page (FR-KAN-02, D-91): active columns left to
// right with their cards and WIP limit (marked when over it), archived ones in the board menu with Unarchive; add,
// rename, WIP limit (checked, empty = none), move by the menu, archive and delete (confirmation naming its cards, Undo)
// through sync; a view share and an archived board change nothing.
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { comparePositions } from "@/lib/position";
import { localDb } from "@/sync/db";

import { json, me, renderApp, stubApi } from "./fake-api";

const USER = me().id;
const BOARD = "0199f000-0000-7000-8000-0000000000b1";
const TODO = "0199f000-0000-7000-8000-0000000000d1";
const DOING = "0199f000-0000-7000-8000-0000000000d2";
const OLD = "0199f000-0000-7000-8000-0000000000d3";

const column = (id: string, name: string, extra: Record<string, unknown> = {}) => ({
  id,
  board_id: BOARD,
  container_kind: "board",
  container_id: BOARD,
  name,
  position: "U",
  wip_limit: null,
  archived_at: null,
  deleted_at: null,
  version: 1,
  ...extra,
});

const card = (id: string, columnId: string) => ({
  id,
  kind: "card",
  container_kind: "board",
  container_id: BOARD,
  column_id: columnId,
  title: id,
  deleted_at: null,
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
  await db.boardColumns.bulkPut([
    column(TODO, "To do", { position: "C" }),
    column(DOING, "Doing", { position: "M", wip_limit: 1 }),
    column(OLD, "Old", { position: "Z", archived_at: "2026-10-01T10:00:00Z" }),
  ]);
  await db.items.bulkPut([card("c1", DOING), card("c2", DOING), card("c3", TODO)]);
  if (share) await db.shares.put(share);
  // Pushes never answer here, so the outbox keeps what the page wrote.
  stubApi({ "GET /me": () => json(me()), "POST /sync/push": () => new Promise<Response>(() => undefined) });
  renderApp(`/kanban/${BOARD}`);
  await screen.findByRole("heading", { name: "Revamp", level: 1 });
  return { user: userEvent.setup(), db };
}

async function outbox() {
  const db = await localDb(USER);
  return db.outbox.orderBy("seq").toArray();
}

const columnNames = async () =>
  (await screen.findAllByRole("heading", { level: 2 })).map((heading) => heading.textContent);

async function columnMenu(user: ReturnType<typeof userEvent.setup>, name: string) {
  await user.click(await screen.findByRole("button", { name: `Options for column ${name}` }));
  return screen.findByRole("menu");
}

describe("board columns", { timeout: 20_000 }, () => {
  it("shows the active columns with their cards and WIP limit, the archived ones in the board menu", async () => {
    const { user } = await open();
    expect(await columnNames()).toEqual(["To do", "Doing"]);
    const doing = screen.getByRole("region", { name: "Doing" });
    expect(within(doing).getByLabelText("2 cards, over the limit of 1")).toHaveTextContent("2 / 1");
    expect(within(screen.getByRole("region", { name: "To do" })).getByLabelText("1 card")).toHaveTextContent("1");

    await user.click(screen.getByRole("button", { name: "Options for Revamp" }));
    await user.click(await screen.findByRole("menuitem", { name: "Archived columns (1)…" }));
    const dialog = await screen.findByRole("dialog", { name: "Archived columns" });
    await user.click(within(dialog).getByRole("button", { name: "Unarchive Old" }));
    await screen.findByText("Unarchived Old");
    expect(await outbox()).toMatchObject([
      { entity_type: "board_column", entity_id: OLD, op: "update", data: { archived_at: null } },
    ]);
  });

  it("adds, renames, limits, moves, archives and deletes a column", async () => {
    const { user, db } = await open();
    await user.click(await screen.findByRole("button", { name: "Add column" }));
    let dialog = await screen.findByRole("dialog", { name: "New column" });
    await user.type(within(dialog).getByLabelText("Name"), "Review{Enter}");
    await screen.findByText("Column added: Review");
    const [added] = await outbox();
    expect(added).toMatchObject({
      entity_type: "board_column",
      op: "create",
      data: { board_id: BOARD, name: "Review" },
    });
    // After every column of the board, the archived one too.
    expect(comparePositions(String(added?.data?.position), "Z")).toBe(1);
    await waitFor(async () => {
      expect(await columnNames()).toEqual(["To do", "Doing", "Review"]);
    });

    await user.click(within(await columnMenu(user, "To do")).getByRole("menuitem", { name: "Rename…" }));
    dialog = await screen.findByRole("dialog", { name: "Rename column" });
    await user.clear(within(dialog).getByLabelText("Name"));
    await user.type(within(dialog).getByLabelText("Name"), "Next{Enter}");
    await screen.findByText("Renamed to Next");

    await user.click(within(await columnMenu(user, "Doing")).getByRole("menuitem", { name: "WIP limit…" }));
    dialog = await screen.findByRole("dialog", { name: "WIP limit of Doing" });
    const field = within(dialog).getByLabelText("Most cards");
    await user.clear(field);
    await user.type(field, "0{Enter}");
    expect(within(dialog).getByText("Use a whole number from 1 to 999, or leave it empty.")).toBeInTheDocument();
    await user.clear(field);
    await user.click(within(dialog).getByRole("button", { name: "Save" }));
    await screen.findByText("WIP limit of Doing saved");
    await waitFor(() => {
      expect(within(screen.getByRole("region", { name: "Doing" })).getByLabelText("2 cards")).toBeInTheDocument();
    });

    const menu = await columnMenu(user, "Next");
    expect(within(menu).getByRole("menuitem", { name: "Move left" })).toHaveAttribute("aria-disabled", "true");
    await user.click(within(menu).getByRole("menuitem", { name: "Move right" }));
    await screen.findByText("Moved Next");
    await waitFor(async () => {
      expect(await columnNames()).toEqual(["Doing", "Next", "Review"]);
    });

    await user.click(within(await columnMenu(user, "Review")).getByRole("menuitem", { name: "Archive" }));
    await screen.findByText("Archived Review");
    await waitFor(async () => {
      expect(await columnNames()).toEqual(["Doing", "Next"]);
    });

    await user.click(within(await columnMenu(user, "Doing")).getByRole("menuitem", { name: "Delete…" }));
    const ask = await screen.findByRole("dialog", { name: "Delete column?" });
    expect(ask).toHaveTextContent("Delete “Doing”? Its 2 cards go to the trash with it.");
    await user.click(within(ask).getByRole("button", { name: "Delete" }));
    const toast = await screen.findByText("Deleted Doing");
    await waitFor(async () => {
      expect(await columnNames()).toEqual(["Next"]);
    });
    await waitFor(() => {
      expect(screen.queryByRole("dialog", { name: "Delete column?" })).not.toBeInTheDocument();
    });
    await user.click(within(toast.closest("li") ?? document.body).getByRole("button", { name: "Undo" }));
    await waitFor(async () => {
      expect((await db.boardColumns.get(DOING))?.deleted_at).toBeFalsy();
    });
  });

  it("changes nothing for a view share or on an archived board", async () => {
    await open(
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
    expect(await columnNames()).toEqual(["To do", "Doing"]);
    expect(screen.queryByRole("button", { name: "Add column" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Options for column/ })).not.toBeInTheDocument();
  });

  it("an edit share writes columns", async () => {
    await open(
      { owner_id: "someone-else" },
      {
        id: "s1",
        container_kind: "board",
        container_id: BOARD,
        grantee_id: USER,
        permission: "edit",
        revoked_at: null,
      },
    );
    expect(await screen.findByRole("button", { name: "Add column" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Options for column Doing" })).toBeInTheDocument();
  });

  it("an archived board changes nothing, also for its owner", async () => {
    await open({ archived_at: "2026-10-29T10:00:00Z" });
    expect(await columnNames()).toEqual(["To do", "Doing"]);
    expect(screen.queryByRole("button", { name: "Add column" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Options for column/ })).not.toBeInTheDocument();
  });
});
