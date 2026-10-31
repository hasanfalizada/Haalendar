// +++===+++ 2026-10-30 — Hasan Alizada — HAAL-119. Card assignees in the interface (FR-KAN-10, D-97): a card shows its
// assignees (members only); the editor toggles the members, the user first, and Save writes them in one undo step; a
// board nobody else shares hides the section; the filters take "Me" and the members; the notification "… assigned
// you" opens the card.
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { localChanged } from "@/sync";
import { localDb } from "@/sync/db";

import { json, me, renderApp, stubApi } from "./fake-api";

const USER = me().id;
const BOB = "0199f000-0000-7000-8000-0000000000a2";
const GONE = "0199f000-0000-7000-8000-0000000000a3";
const BOARD = "0199f000-0000-7000-8000-0000000000b1";
const TODO = "0199f000-0000-7000-8000-0000000000d1";
const PLAN = "0199f000-0000-7000-8000-0000000000e1";
const SHIP = "0199f000-0000-7000-8000-0000000000e2";

const MEMBERS = [
  { user_id: USER, display_name: "Ada Admin", permission: "owner" },
  { user_id: BOB, display_name: "Bob Builder", permission: "view" },
];

const card = (id: string, title: string, position: string) => ({
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
});

const assignee = (id: string, item: string, user: string) => ({
  id,
  item_id: item,
  user_id: user,
  container_kind: "board",
  container_id: BOARD,
  deleted_at: null,
  version: 1,
});

async function open(
  options: { members?: typeof MEMBERS; owner?: string; path?: string; api?: Parameters<typeof stubApi>[0] } = {},
) {
  window.localStorage.clear();
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
  await db.items.bulkPut([card(PLAN, "Plan", "C"), card(SHIP, "Ship", "M")]);
  await db.cardAssignees.bulkPut([assignee("as-bob", PLAN, BOB), assignee("as-gone", SHIP, GONE)]);
  stubApi({
    "GET /me": () => json(me()),
    "POST /sync/push": () => new Promise<Response>(() => undefined),
    [`GET /boards/${BOARD}/members`]: () => json({ data: options.members ?? MEMBERS }),
    ...options.api,
  });
  const { router } = renderApp(options.path ?? `/kanban/${BOARD}`);
  await screen.findByRole("button", { name: /Account menu/ });
  return { user: userEvent.setup(), db, router };
}

async function outbox() {
  const db = await localDb(USER);
  return db.outbox.orderBy("seq").toArray();
}

const titles = (region: HTMLElement) =>
  within(region)
    .queryAllByRole("button", { name: /^Open / })
    .map((button) => button.getAttribute("aria-label")?.replace(/^Open /, ""));

describe("card assignees", { timeout: 20_000 }, () => {
  // +++===+++ 2026-10-30 — Hasan Alizada — HAAL-140. Found by the end-to-end tests: a board just made on this device is
  // not on the server yet (version 0), so its members are asked only once it arrived there.
  it("asks for the members only once the board is on the server", async () => {
    const db = await localDb(USER);
    await db.boards.put({
      id: BOARD,
      owner_id: USER,
      name: "Fresh",
      position: "U",
      archived_at: null,
      deleted_at: null,
      version: 0,
    });
    const calls = stubApi({
      "GET /me": () => json(me()),
      "POST /sync/push": () => new Promise<Response>(() => undefined),
      [`GET /boards/${BOARD}/members`]: () => json({ data: MEMBERS }),
    });
    renderApp(`/kanban/${BOARD}`);
    await screen.findByRole("heading", { name: "Fresh" });
    expect(calls.some((c) => c.path.endsWith("/members"))).toBe(false);

    await db.boards.update(BOARD, { version: 1 });
    localChanged(USER);
    await waitFor(() => {
      expect(calls.some((c) => c.path === `/boards/${BOARD}/members`)).toBe(true);
    });
  });

  it("shows a card's assignees and changes them with Save in one undo step", async () => {
    const { user, db } = await open();
    const plan = await screen.findByRole("button", { name: "Open Plan" });
    expect(await within(plan).findByRole("img", { name: "Assigned to Bob Builder" })).toBeInTheDocument();
    // Someone no longer a member is not shown.
    expect(within(screen.getByRole("button", { name: "Open Ship" })).queryByRole("img")).not.toBeInTheDocument();

    await user.click(plan);
    const editor = await screen.findByRole("dialog", { name: "Edit card" });
    const section = within(editor).getByRole("region", { name: "Assignees" });
    const buttons = within(section).getAllByRole("button");
    expect(buttons.map((b) => [b.textContent, b.getAttribute("aria-pressed")])).toEqual([
      ["AAAda Admin (me)", "false"],
      ["BBBob Builder", "true"],
    ]);
    await user.click(within(section).getByRole("button", { name: /Ada Admin \(me\)/ }));
    await user.click(within(section).getByRole("button", { name: /Bob Builder/ }));
    await user.click(within(editor).getByRole("button", { name: "Save" }));
    const toast = await screen.findByText("Saved Plan");
    const writes = (await outbox()).map((entry) => [entry.entity_type, entry.op, entry.entity_id, entry.data]);
    expect(writes).toEqual([
      ["card_assignee", "create", expect.any(String), { item_id: PLAN, user_id: USER }],
      ["card_assignee", "delete", "as-bob", undefined],
    ]);
    await waitFor(() => {
      expect(screen.queryByRole("dialog", { name: "Edit card" })).not.toBeInTheDocument();
    });
    await user.click(within(toast.closest("li") ?? document.body).getByRole("button", { name: "Undo" }));
    await waitFor(async () => {
      expect((await db.cardAssignees.get("as-bob"))?.deleted_at).toBeFalsy();
    });
  });

  it("lets a view share see the assignees but change nothing", async () => {
    const db = await localDb(USER);
    await db.shares.put({
      id: "s1",
      container_kind: "board",
      container_id: BOARD,
      grantee_id: USER,
      permission: "view",
      revoked_at: null,
    });
    const { user } = await open({ owner: "someone-else" });
    await user.click(await screen.findByRole("button", { name: "Open Plan" }));
    const viewer = await screen.findByRole("dialog", { name: "Card" });
    const section = within(viewer).getByRole("region", { name: "Assignees" });
    for (const button of within(section).getAllByRole("button")) expect(button).toBeDisabled();
  });

  it("hides the section on a board nobody else shares", async () => {
    const { user } = await open({ members: [MEMBERS[0] as (typeof MEMBERS)[number]] });
    await user.click(await screen.findByRole("button", { name: "Open Ship" }));
    const editor = await screen.findByRole("dialog", { name: "Edit card" });
    expect(within(editor).queryByRole("region", { name: "Assignees" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Assignees" })).not.toBeInTheDocument();
  });

  it("filters by Me and the members, kept in the address", async () => {
    const { user, router } = await open();
    const todo = await screen.findByRole("region", { name: "To do" });
    const bar = screen.getByRole("search", { name: "Board filters" });
    await user.click(await within(bar).findByRole("button", { name: "Assignees" }));
    await user.click(await screen.findByRole("menuitemcheckbox", { name: "Bob Builder" }));
    await user.keyboard("{Escape}");
    await waitFor(() => {
      expect(titles(todo)).toEqual(["Plan"]);
    });
    expect(router.state.location.search).toMatchObject({ assignee: BOB });
    await user.click(within(bar).getByRole("button", { name: "Assignees (1)" }));
    await user.click(await screen.findByRole("menuitemcheckbox", { name: "Bob Builder" }));
    await user.click(await screen.findByRole("menuitemcheckbox", { name: "Me" }));
    await user.keyboard("{Escape}");
    await waitFor(() => {
      expect(titles(todo)).toEqual([]);
    });
  });

  it("names the assignment in the notification and opens the card", async () => {
    const notes = [
      {
        id: "n-1",
        kind: "assigned",
        item_id: PLAN,
        created_at: new Date().toISOString(),
        read_at: null,
        payload: { item_id: PLAN, title: "Plan", board_id: BOARD, board_name: "Revamp", by_name: "Bob Builder" },
      },
    ];
    const { user, router } = await open({
      path: "/calendar",
      api: {
        "GET /notifications": () => json({ data: notes, unread_count: 1, next_cursor: null }),
        "POST /notifications/read": () => new Response(null, { status: 204 }),
      },
    });
    await user.click(await screen.findByRole("button", { name: /^Notifications/ }));
    await user.click(await screen.findByText("Bob Builder assigned you: Plan · Revamp"));
    expect(await screen.findByRole("dialog", { name: "Edit card" })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe(`/kanban/${BOARD}`);
  });
});
