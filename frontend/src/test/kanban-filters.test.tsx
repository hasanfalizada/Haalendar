// +++===+++ 2026-10-30 — Hasan Alizada — HAAL-118. The board filters in the interface (FR-KAN-09, D-96): text, labels,
// priority and due date narrow the cards, are kept in the address (and read from it), each column says how many it
// shows, Clear filters brings everything back; moves work among the cards shown, and a card added that the filters
// hide says so.
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { addDays, todayIn } from "@/lib/datetime";
import { comparePositions } from "@/lib/position";
import { localDb } from "@/sync/db";

import { json, me, renderApp, stubApi } from "./fake-api";

const USER = me().id;
const TODAY = todayIn(me().time_zone);
const BOARD = "0199f000-0000-7000-8000-0000000000b1";
const TODO = "0199f000-0000-7000-8000-0000000000d1";
const URGENT = "0199f000-0000-7000-8000-0000000000f1";

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

async function open(search = "") {
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
    card("plan", "Plan", "C", { priority: "high", due_date: addDays(TODAY, -1) }),
    card("ship", "Ship", "M", { body: "Deploy the build" }),
    card("docs", "Docs", "N", { priority: "low", due_date: TODAY }),
    card("test", "Test", "P"),
  ]);
  await db.labels.put({
    id: URGENT,
    board_id: BOARD,
    container_kind: "board",
    container_id: BOARD,
    name: "Urgent",
    color: "red",
    deleted_at: null,
  });
  await db.itemLabels.put({
    id: "il1",
    item_id: "plan",
    label_id: URGENT,
    container_kind: "board",
    container_id: BOARD,
    deleted_at: null,
  });
  stubApi({ "GET /me": () => json(me()), "POST /sync/push": () => new Promise<Response>(() => undefined) });
  const { router } = renderApp(`/kanban/${BOARD}${search}`);
  await screen.findByRole("heading", { name: "Revamp", level: 1 });
  const todo = await screen.findByRole("region", { name: "To do" });
  return { user: userEvent.setup(), router, todo };
}

async function outbox() {
  const db = await localDb(USER);
  return db.outbox.orderBy("seq").toArray();
}

const titles = (region: HTMLElement) =>
  within(region)
    .queryAllByRole("button", { name: /^Open / })
    .map((button) => button.getAttribute("aria-label")?.replace(/^Open /, ""));

describe("board filters", { timeout: 20_000 }, () => {
  it("narrows the cards by text, labels, priority and due date, kept in the address, and clears", async () => {
    const { user, router, todo } = await open();
    await waitFor(() => {
      expect(titles(todo)).toEqual(["Plan", "Ship", "Docs", "Test"]);
    });
    const bar = screen.getByRole("search", { name: "Board filters" });

    await user.type(within(bar).getByLabelText("Search cards"), "deploy");
    await waitFor(() => {
      expect(titles(todo)).toEqual(["Ship"]);
    });
    expect(within(todo).getByText("1 shown")).toBeInTheDocument();
    expect(router.state.location.search).toMatchObject({ q: "deploy" });
    await user.clear(within(bar).getByLabelText("Search cards"));

    await user.click(within(bar).getByRole("button", { name: "Labels" }));
    await user.click(await screen.findByRole("menuitemcheckbox", { name: "Urgent" }));
    await user.keyboard("{Escape}");
    await waitFor(() => {
      expect(titles(todo)).toEqual(["Plan"]);
    });
    expect(router.state.location.search).toMatchObject({ labels: URGENT });

    await user.click(within(bar).getByRole("button", { name: "Clear filters" }));
    await user.click(within(within(bar).getByRole("group", { name: "Filter by priority" })).getByText("Low"));
    await user.click(within(within(bar).getByRole("group", { name: "Due date" })).getByText("Overdue"));
    // Low or high is not asked; low and overdue together: none.
    await waitFor(() => {
      expect(titles(todo)).toEqual([]);
    });
    await user.click(within(within(bar).getByRole("group", { name: "Due date" })).getByText("Today"));
    await waitFor(() => {
      expect(titles(todo)).toEqual(["Docs"]);
    });
    expect(router.state.location.search).toMatchObject({ priority: "low", due: "overdue,today" });

    await user.click(within(bar).getByRole("button", { name: "Clear filters" }));
    await waitFor(() => {
      expect(titles(todo)).toEqual(["Plan", "Ship", "Docs", "Test"]);
    });
    expect(within(todo).queryByText(/shown$/)).not.toBeInTheDocument();
  });

  it("reads the filters from the address", async () => {
    const { todo } = await open("?due=none&priority=medium");
    await waitFor(() => {
      expect(titles(todo)).toEqual(["Ship", "Test"]);
    });
    expect(within(screen.getByRole("group", { name: "Due date" })).getByText("No due date")).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  it("moves among the cards shown; a card added that passes the filters is simply added", async () => {
    const { user, todo } = await open("?priority=medium");
    await waitFor(() => {
      expect(titles(todo)).toEqual(["Ship", "Test"]);
    });
    within(todo).getByRole("button", { name: "Open Test" }).focus();
    await user.keyboard("{Alt>}{ArrowUp}{/Alt}");
    await waitFor(() => {
      expect(titles(todo)).toEqual(["Test", "Ship"]);
    });
    // Right before Ship: after the hidden Plan ("C"), before Ship ("M").
    const [move] = await outbox();
    const position = String((move?.data as Record<string, unknown>).position);
    expect(comparePositions(position, "C")).toBe(1);
    expect(comparePositions(position, "M")).toBe(-1);

    await user.click(within(todo).getByRole("button", { name: "Add a card to To do" }));
    await user.type(within(todo).getByLabelText("Title of the new card in To do"), "Fresh{Enter}");
    expect(await screen.findByText("Card added: Fresh")).toBeInTheDocument();
  });

  it("says when a card added is hidden by the filters", async () => {
    const { user, todo } = await open("?priority=high");
    await user.click(within(todo).getByRole("button", { name: "Add a card to To do" }));
    await user.type(within(todo).getByLabelText("Title of the new card in To do"), "Fresh{Enter}");
    expect(await screen.findByText("Card added: Fresh — hidden by the filters")).toBeInTheDocument();
  });
});
