// +++===+++ 2026-11-25 09:48 +04 — Hasan Alizada — HAAL-114. Card comments and activity in the interface (FR-KAN-05,
// FR-X-03, D-123): a comment is written at once (also with Ctrl+Enter, which does not save the card) and shows as the
// user's; its author changes it ("edited") and deletes it with Undo; the board's owner deletes another's comment but
// cannot change it; a view share only reads; the history reads in words and "Comments only" hides it; offline the
// comments stay and a line says the history needs the connection; the comment notification opens the card; the search
// finds a card by its comments; an event's history opens closed and asks the server only once opened.
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { localDb } from "@/sync/db";

import { json, me, noPush, renderApp, stubApi } from "./fake-api";

const USER = me().id;
const BOB = "0199f000-0000-7000-8000-0000000000a2";
const BOARD = "0199f000-0000-7000-8000-0000000000b1";
const TODO = "0199f000-0000-7000-8000-0000000000d1";
const DONE = "0199f000-0000-7000-8000-0000000000d2";
const PLAN = "0199f000-0000-7000-8000-0000000000e1";
const LABEL = "0199f000-0000-7000-8000-0000000000f1";

const MEMBERS = [
  { user_id: USER, display_name: "Ada Admin", permission: "owner" },
  { user_id: BOB, display_name: "Bob Builder", permission: "edit" },
];

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

const comment = (id: string, author: string, body: string, created: string, edited: string | null = null) => ({
  id,
  item_id: PLAN,
  author_id: author,
  body,
  edited_at: edited,
  container_kind: "board",
  container_id: BOARD,
  created_at: created,
  updated_at: created,
  deleted_at: null,
  version: 1,
});

const record = (over: Record<string, unknown>) => ({
  id: crypto.randomUUID(),
  occurred_at: "2026-11-20T10:00:00Z",
  actor_id: BOB,
  actor_name: "Bob Builder",
  action: "update",
  entity_type: "item",
  entity_id: PLAN,
  before: null,
  after: null,
  ...over,
});

const HISTORY = [
  record({ action: "create", occurred_at: "2026-11-18T09:00:00Z", after: { title: "Plan", kind: "card" } }),
  record({
    action: "update",
    occurred_at: "2026-11-19T09:00:00Z",
    before: { title: "Plann" },
    after: { title: "Plan" },
  }),
  record({
    action: "move",
    entity_type: "card",
    occurred_at: "2026-11-19T10:00:00Z",
    before: { column_id: TODO },
    after: { column_id: DONE },
  }),
  record({
    action: "create",
    entity_type: "item_label",
    entity_id: "il-1",
    occurred_at: "2026-11-19T11:00:00Z",
    after: { item_id: PLAN, label_id: LABEL },
  }),
  // A comment's own record is not repeated: the comment shows itself.
  record({ action: "create", entity_type: "comment", entity_id: "c-bob", occurred_at: "2026-11-21T08:00:00Z" }),
];

async function open(
  options: { owner?: string; share?: Record<string, unknown>; path?: string; api?: Parameters<typeof stubApi>[0] } = {},
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
  await db.boardColumns.bulkPut([column(TODO, "To do", "C"), column(DONE, "Done", "M")]);
  await db.labels.put({
    id: LABEL,
    board_id: BOARD,
    container_kind: "board",
    container_id: BOARD,
    name: "Urgent",
    color: "red",
    deleted_at: null,
    version: 1,
  });
  await db.items.put({
    id: PLAN,
    kind: "card",
    container_kind: "board",
    container_id: BOARD,
    column_id: DONE,
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
  await db.comments.bulkPut([comment("c-bob", BOB, "Looks **good**", "2026-11-21T08:00:00Z", "2026-11-21T08:05:00Z")]);
  if (options.share) await db.shares.put(options.share);
  const calls = stubApi({
    "GET /me": () => json(me()),
    "POST /sync/push": noPush,
    [`GET /boards/${BOARD}/members`]: () => json({ data: MEMBERS }),
    [`GET /items/${PLAN}/history`]: () => json({ data: [...HISTORY].reverse(), next_cursor: null }),
    ...options.api,
  });
  const { router } = renderApp(options.path ?? `/kanban/${BOARD}`);
  await screen.findByRole("button", { name: /Account menu/ });
  return { user: userEvent.setup(), db, router, calls };
}

async function outbox() {
  const db = await localDb(USER);
  return db.outbox.orderBy("seq").toArray();
}

const activity = (dialog: HTMLElement) => within(dialog).getByRole("list", { name: "Activity" });
const lines = (dialog: HTMLElement) =>
  within(activity(dialog))
    .queryAllByRole("listitem")
    .filter((li) => li.parentElement === activity(dialog))
    .map((li) => li.textContent.replace(/\s+/g, " ").trim());

async function openCard(user: ReturnType<typeof userEvent.setup>, name = "Edit card") {
  await user.click(await screen.findByRole("button", { name: "Open Plan" }));
  return screen.findByRole("dialog", { name });
}

describe("card comments and activity", { timeout: 20_000 }, () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("reads comments and the history in words, newest first; Comments only hides the history", async () => {
    const { user } = await open();
    const editor = await openCard(user);
    await waitFor(() => {
      expect(lines(editor)).toHaveLength(5);
    });
    // The Markdown renderer arrives a moment later.
    await waitFor(() => {
      expect(lines(editor)[0]).toMatch(/^Bob Builder · .+ · editedLooks good$/);
    });
    expect(lines(editor).slice(1)).toEqual([
      expect.stringMatching(/^Bob Builder added the label Urgent · ./),
      expect.stringMatching(/^Bob Builder moved the card to Done · ./),
      expect.stringMatching(/^Bob Builder changed the title · ./),
      expect.stringMatching(/^Bob Builder created the card · ./),
    ]);
    await user.click(within(editor).getByRole("checkbox", { name: "Comments only" }));
    expect(lines(editor)).toHaveLength(1);
  });

  it("writes a comment at once, also with Ctrl+Enter, without saving the card", async () => {
    const { user } = await open();
    const editor = await openCard(user);
    const box = within(editor).getByLabelText("Comment");
    expect(within(editor).getByRole("button", { name: "Comment" })).toBeDisabled();
    await user.type(box, "   ");
    expect(within(editor).getByRole("button", { name: "Comment" })).toBeDisabled();
    await user.clear(box);
    // The card has unsaved changes: Ctrl+Enter in the comment sends the comment, the card stays as it is.
    await user.clear(within(editor).getByLabelText("Title"));
    await user.type(within(editor).getByLabelText("Title"), "Plan B");
    await user.type(box, "First draft is ready");
    await user.keyboard("{Control>}{Enter}{/Control}");
    expect(await screen.findByText("Comment added to Plan")).toBeInTheDocument();
    expect(screen.getByRole("dialog", { name: "Edit card" })).toBeInTheDocument();
    expect(box).toHaveValue("");
    const sent = await outbox();
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({
      entity_type: "comment",
      op: "create",
      data: { item_id: PLAN, body: "First draft is ready" },
    });
    await waitFor(() => {
      expect(lines(editor)[0]).toMatch(/^You.*First draft is ready$/);
    });
    const db = await localDb(USER);
    expect(await db.comments.get(sent[0]?.entity_id ?? "")).toMatchObject({
      author_id: USER,
      container_id: BOARD,
      edited_at: null,
    });
  });

  it("lets the author change and delete a comment with Undo; the owner deletes another's but cannot change it", async () => {
    const { user, db } = await open();
    await db.comments.put(comment("c-mine", USER, "Mine", "2026-11-22T08:00:00Z"));
    const editor = await openCard(user);
    const mine = await within(editor).findByRole("listitem", { name: "Comment by You" });
    const bobs = within(editor).getByRole("listitem", { name: "Comment by Bob Builder" });
    expect(within(bobs).queryByRole("button", { name: "Change the comment" })).not.toBeInTheDocument();
    expect(within(bobs).getByRole("button", { name: "Delete the comment" })).toBeInTheDocument();

    await user.click(within(mine).getByRole("button", { name: "Change the comment" }));
    const area = within(mine).getByLabelText("Text of the comment");
    await user.clear(area);
    await user.type(area, "Mine, better");
    await user.click(within(mine).getByRole("button", { name: "Save" }));
    await screen.findByText("Comment changed");
    expect((await outbox()).at(-1)).toMatchObject({
      entity_type: "comment",
      entity_id: "c-mine",
      op: "update",
      base: { body: "Mine" },
      data: { body: "Mine, better" },
    });
    await waitFor(() => {
      expect(within(editor).getByRole("listitem", { name: "Comment by You" })).toHaveTextContent(
        /edited.*Mine, better/,
      );
    });

    await user.click(
      within(within(editor).getByRole("listitem", { name: "Comment by You" })).getByRole("button", {
        name: "Delete the comment",
      }),
    );
    const toast = await screen.findByText("Comment deleted");
    expect((await outbox()).at(-1)).toMatchObject({ entity_id: "c-mine", op: "delete" });
    await waitFor(() => {
      expect(within(editor).queryByRole("listitem", { name: "Comment by You" })).not.toBeInTheDocument();
    });
    fireEvent.click(within(toast.closest("li") ?? document.body).getByRole("button", { name: "Undo" }));
    expect(await within(editor).findByRole("listitem", { name: "Comment by You" })).toBeInTheDocument();
    // The delete had not left the device: Undo took it back out of the outbox.
    expect((await outbox()).filter((entry) => entry.entity_id === "c-mine").map((entry) => entry.op)).toEqual([
      "update",
    ]);
  });

  it("an edit share deletes only its own comments; a view share only reads", async () => {
    const share = (permission: string) => ({
      id: "s1",
      container_kind: "board",
      container_id: BOARD,
      grantee_id: USER,
      permission,
      revoked_at: null,
    });
    const { user } = await open({ owner: BOB, share: share("view") });
    const viewer = await openCard(user, "Card");
    const bobs = await within(viewer).findByRole("listitem", { name: "Comment by Bob Builder" });
    expect(within(viewer).queryByLabelText("Comment")).not.toBeInTheDocument();
    expect(within(bobs).queryAllByRole("button")).toEqual([]);
  });

  it("offline keeps the comments and says the history needs the connection", async () => {
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
    const { user, calls } = await open();
    const editor = await openCard(user);
    expect(
      await within(editor).findByText("The history shows when this device is online. Comments are here offline too."),
    ).toBeInTheDocument();
    expect(lines(editor)).toHaveLength(1);
    expect(calls.some((call) => call.path.startsWith(`/items/${PLAN}/history`))).toBe(false);
  });

  it("names a comment in the notification and opens the card", async () => {
    const notes = [
      {
        id: "n-1",
        kind: "comment",
        item_id: PLAN,
        created_at: new Date().toISOString(),
        read_at: null,
        payload: {
          comment_id: "c-bob",
          item_id: PLAN,
          title: "Plan",
          board_id: BOARD,
          board_name: "Revamp",
          by_name: "Bob Builder",
        },
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
    await user.click(await screen.findByText("Bob Builder commented on Plan · Revamp"));
    expect(await screen.findByRole("dialog", { name: "Edit card" })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe(`/kanban/${BOARD}`);
  });

  it("finds a card by its comments", async () => {
    const { user } = await open();
    await user.keyboard("/");
    await user.type(await screen.findByRole("combobox", { name: "Search" }), "good");
    const results = await screen.findByRole("listbox", { name: "Search results" });
    expect(await within(results).findByRole("option", { name: /Plan/ })).toHaveTextContent("Comments: Looks good");
  });
});
