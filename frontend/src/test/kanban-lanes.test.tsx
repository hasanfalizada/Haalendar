// +++===+++ 2026-11-27 — Hasan Alizada — HAAL-115 (FR-KAN-06, D-130). Swimlanes in the interface: chosen in the filter
// bar and kept in the address; lanes by priority, assignee (a card with two assignees in both) or label; a lane folds;
// Alt+arrows move a card within its lane (its priority stays); a card added in a lane gets the lane's value.
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { localDb } from "@/sync/db";

import { json, me, noPush, renderApp, stubApi } from "./fake-api";

const USER = me().id;
const BOB = "0199f000-0000-7000-8000-0000000000a2";
const BOARD = "0199f000-0000-7000-8000-0000000000b1";
const TODO = "0199f000-0000-7000-8000-0000000000d1";
const DONE = "0199f000-0000-7000-8000-0000000000d2";
const URGENT = "0199f000-0000-7000-8000-0000000000f1";

const MEMBERS = [
  { user_id: USER, display_name: "Ada Admin", permission: "owner" },
  { user_id: BOB, display_name: "Bob Builder", permission: "edit" },
];

const card = (id: string, title: string, position: string, extra: Record<string, unknown> = {}) => ({
  id,
  kind: "card",
  container_kind: "board",
  container_id: BOARD,
  column_id: TODO,
  title,
  body: "",
  color: "green",
  priority: "medium",
  position,
  due_date: null,
  due_time: null,
  deleted_at: null,
  version: 2,
  ...extra,
});

const column = (id: string, name: string, position: string) => ({
  id,
  board_id: BOARD,
  container_kind: "board",
  container_id: BOARD,
  name,
  position,
  wip_limit: null,
  archived_at: null,
  deleted_at: null,
  version: 1,
});

const onBoard = { container_kind: "board", container_id: BOARD, deleted_at: null, version: 1 };

async function open(search = "") {
  window.localStorage.clear();
  const db = await localDb(USER);
  await db.boards.put({
    id: BOARD,
    owner_id: USER,
    name: "Revamp",
    position: "U",
    archived_at: null,
    deleted_at: null,
    version: 2,
  });
  await db.boardColumns.bulkPut([column(TODO, "To do", "C"), column(DONE, "Done", "M")]);
  await db.items.bulkPut([
    card("plan", "Plan", "C", { priority: "high" }),
    card("ship", "Ship", "M"),
    card("test", "Test", "P"),
    card("docs", "Docs", "C", { column_id: DONE, priority: "low" }),
  ]);
  await db.labels.put({ id: URGENT, board_id: BOARD, name: "Urgent", color: "red", ...onBoard });
  await db.itemLabels.put({ id: "il1", item_id: "plan", label_id: URGENT, ...onBoard });
  await db.cardAssignees.bulkPut([
    { id: "as1", item_id: "plan", user_id: USER, ...onBoard },
    { id: "as2", item_id: "plan", user_id: BOB, ...onBoard },
    { id: "as3", item_id: "ship", user_id: BOB, ...onBoard },
  ]);
  stubApi({
    "GET /me": () => json(me()),
    "POST /sync/push": noPush,
    [`GET /boards/${BOARD}/members`]: () => json({ data: MEMBERS }),
  });
  const { router } = renderApp(`/kanban/${BOARD}${search}`);
  await screen.findByRole("heading", { name: "Revamp", level: 1 });
  return { user: userEvent.setup(), router };
}

async function outbox() {
  const db = await localDb(USER);
  return db.outbox.orderBy("seq").toArray();
}

const titles = (region: HTMLElement) =>
  within(region)
    .queryAllByRole("button", { name: /^Open / })
    .map((button) => button.getAttribute("aria-label")?.replace(/^Open /, ""));

const cell = (name: string) => screen.getByRole("group", { name });

describe("swimlanes", { timeout: 20_000 }, () => {
  it("are chosen in the filter bar, kept in the address, and group the cards by priority", async () => {
    const { user, router } = await open();
    await waitFor(() => {
      expect(titles(screen.getByRole("region", { name: "To do" }))).toEqual(["Plan", "Ship", "Test"]);
    });
    const bar = screen.getByRole("search", { name: "Board filters" });
    await user.click(within(bar).getByRole("button", { name: "Swimlanes" }));
    await user.click(await screen.findByRole("menuitemcheckbox", { name: "Priority" }));
    await waitFor(() => {
      expect(router.state.location.search).toMatchObject({ lanes: "priority" });
    });

    expect(screen.getByRole("region", { name: "High, 1 card" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Medium, 2 cards" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Low, 1 card" })).toBeInTheDocument();
    expect(titles(cell("To do, High"))).toEqual(["Plan"]);
    expect(titles(cell("To do, Medium"))).toEqual(["Ship", "Test"]);
    expect(titles(cell("Done, Low"))).toEqual(["Docs"]);
    expect(titles(cell("Done, High"))).toEqual([]);
    // The column headers stay once, with all their cards.
    expect(within(screen.getByRole("region", { name: "To do" })).getByLabelText("3 cards")).toBeInTheDocument();
    expect(within(bar).getByRole("button", { name: "Swimlanes: Priority" })).toBeInTheDocument();

    // A lane folds.
    await user.click(screen.getByRole("button", { name: "Medium, 2 cards" }));
    expect(screen.queryByRole("group", { name: "To do, Medium" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Medium, 2 cards" })).toHaveAttribute("aria-expanded", "false");

    await user.click(within(bar).getByRole("button", { name: "Swimlanes: Priority" }));
    await user.click(await screen.findByRole("menuitemcheckbox", { name: "None" }));
    await waitFor(() => {
      expect(screen.queryByRole("group", { name: "To do, High" })).not.toBeInTheDocument();
    });
    expect(router.state.location.search).not.toHaveProperty("lanes");
  });

  it("moves a card with Alt+arrows within its lane, keeping its priority", async () => {
    const { user } = await open("?lanes=priority");
    await waitFor(() => {
      expect(titles(cell("To do, Medium"))).toEqual(["Ship", "Test"]);
    });
    within(cell("To do, Medium")).getByRole("button", { name: "Open Test" }).focus();
    await user.keyboard("{Alt>}{ArrowUp}{/Alt}");
    await waitFor(() => {
      expect(titles(cell("To do, Medium"))).toEqual(["Test", "Ship"]);
    });
    // Up again: the top of its lane (Plan above is another lane).
    await user.keyboard("{Alt>}{ArrowUp}{/Alt}");
    await user.keyboard("{Alt>}{ArrowRight}{/Alt}");
    await waitFor(() => {
      expect(titles(cell("Done, Medium"))).toEqual(["Test"]);
    });
    expect(within(cell("Done, Medium")).getByRole("button", { name: "Open Test" })).toHaveFocus();
    // The moves of one card wait as one write; only the column and the position.
    const writes = await outbox();
    expect(writes.map((w) => Object.keys(w.data as Record<string, unknown>).sort())).toEqual([
      ["column_id", "position"],
    ]);
    expect(screen.getByText(/Test moved to Done in Medium, position 1 of 1/)).toBeInTheDocument();
  });

  it("groups by assignee — a card with two in both lanes — and by label; a card added in a lane gets its value", async () => {
    const { user } = await open("?lanes=assignee");
    await waitFor(() => {
      expect(titles(cell("To do, Bob Builder"))).toEqual(["Plan", "Ship"]);
    });
    expect(titles(cell("To do, Ada Admin"))).toEqual(["Plan"]);
    expect(titles(cell("To do, Unassigned"))).toEqual(["Test"]);
    expect(titles(cell("Done, Unassigned"))).toEqual(["Docs"]);

    const bob = cell("Done, Bob Builder");
    await user.click(within(bob).getByRole("button", { name: "Add card to Done, Bob Builder" }));
    await user.type(within(bob).getByLabelText("Title of the new card in Done, Bob Builder"), "Review{Enter}");
    await waitFor(() => {
      expect(titles(cell("Done, Bob Builder"))).toEqual(["Review"]);
    });
    const [created, assigned] = await outbox();
    expect(created?.entity_type).toBe("item");
    expect(assigned).toMatchObject({
      entity_type: "card_assignee",
      op: "create",
      data: { item_id: created?.entity_id, user_id: BOB },
    });
  });

  it("by label: the board's labels, then No label; a card added there gets the label", async () => {
    const { user } = await open("?lanes=label");
    await waitFor(() => {
      expect(titles(cell("To do, Urgent"))).toEqual(["Plan"]);
    });
    expect(titles(cell("To do, No label"))).toEqual(["Ship", "Test"]);
    const urgent = cell("Done, Urgent");
    await user.click(within(urgent).getByRole("button", { name: "Add card to Done, Urgent" }));
    await user.type(within(urgent).getByLabelText("Title of the new card in Done, Urgent"), "Hotfix{Enter}");
    await waitFor(async () => {
      expect((await outbox()).map((w) => w.entity_type)).toEqual(["item", "item_label"]);
    });
    expect((await outbox())[1]?.data).toMatchObject({ label_id: URGENT });
  });

  it("a card added in a priority lane gets that priority", async () => {
    const { user } = await open("?lanes=priority");
    const low = await waitFor(() => cell("To do, Low"));
    await user.click(within(low).getByRole("button", { name: "Add card to To do, Low" }));
    await user.type(within(low).getByLabelText("Title of the new card in To do, Low"), "Later{Enter}");
    await waitFor(() => {
      expect(titles(cell("To do, Low"))).toEqual(["Later"]);
    });
    expect((await outbox())[0]?.data).toMatchObject({ priority: "low", title: "Later" });
  });
});
