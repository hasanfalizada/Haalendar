// +++===+++ 2026-10-30 — Hasan Alizada — HAAL-116. Reminders on cards in the interface (FR-KAN-07, D-94): a card shows a
// bell while one of the user's reminders is ahead; the card editor adds the event presets counted from the due date,
// removes one, and Save writes them with the card in one undo step; without a due date nothing can be added; a view
// share sets its own reminders and saves only them; a card's reminder notification names the card and its board and
// opens the card there.
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { addDays, todayIn } from "@/lib/datetime";
import { localDb } from "@/sync/db";

import { json, me, renderApp, stubApi } from "./fake-api";

const USER = me().id;
const ZONE = me().time_zone;
const TOMORROW = addDays(todayIn(ZONE), 1);
const BOARD = "0199f000-0000-7000-8000-0000000000b1";
const TODO = "0199f000-0000-7000-8000-0000000000d1";
const PLAN = "0199f000-0000-7000-8000-0000000000e1";
const SHIP = "0199f000-0000-7000-8000-0000000000e2";

const card = (id: string, title: string, extra: Record<string, unknown> = {}) => ({
  id,
  kind: "card",
  container_kind: "board",
  container_id: BOARD,
  column_id: TODO,
  title,
  body: "",
  color: "green",
  priority: "medium",
  position: "U",
  due_date: null,
  due_time: null,
  deleted_at: null,
  version: 2,
  ...extra,
});

async function open(
  options: { owner?: string; share?: Record<string, unknown>; path?: string; api?: Parameters<typeof stubApi>[0] } = {},
) {
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
    card(PLAN, "Plan", { position: "C", due_date: TOMORROW, due_time: "09:30" }),
    card(SHIP, "Ship", { position: "M" }),
  ]);
  await db.reminders.put({
    id: "r-30",
    item_id: PLAN,
    owner_id: USER,
    offset_minutes: 30,
    all_day_time: null,
    all_day_days_before: null,
    remind_at: null,
    deleted_at: null,
    version: 1,
  });
  if (options.share) await db.shares.put(options.share);
  stubApi({
    "GET /me": () => json(me()),
    "POST /sync/push": () => new Promise<Response>(() => undefined),
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

const reminders = (editor: HTMLElement) => within(editor).getByRole("group", { name: "Reminders" });

describe("reminders on cards", { timeout: 20_000 }, () => {
  it("shows a bell, adds a reminder from the due time, removes one and saves them in one undo step", async () => {
    const { user, db } = await open();
    const plan = await screen.findByRole("button", { name: "Open Plan" });
    expect(within(plan).getByRole("img", { name: "Reminder set" })).toBeInTheDocument();
    expect(within(screen.getByRole("button", { name: "Open Ship" })).queryByRole("img")).not.toBeInTheDocument();

    await user.click(plan);
    const editor = await screen.findByRole("dialog", { name: "Edit card" });
    const section = reminders(editor);
    expect(await within(section).findByText("30 minutes before")).toBeInTheDocument();
    await user.selectOptions(within(section).getByLabelText("Add reminder"), "At the due time");
    await user.click(within(section).getByRole("button", { name: "Remove reminder: 30 minutes before" }));
    expect(within(section).getByText("At the due time")).toBeInTheDocument();
    await user.click(within(editor).getByRole("button", { name: "Save" }));

    const toast = await screen.findByText("Saved Plan");
    const writes = (await outbox()).map((entry) => [entry.entity_type, entry.op, entry.entity_id, entry.data]);
    expect(writes).toEqual([
      ["reminder", "delete", "r-30", undefined],
      ["reminder", "create", expect.any(String), { item_id: PLAN, offset_minutes: 0 }],
    ]);
    await waitFor(() => {
      expect(screen.queryByRole("dialog", { name: "Edit card" })).not.toBeInTheDocument();
    });
    await user.click(within(toast.closest("li") ?? document.body).getByRole("button", { name: "Undo" }));
    await waitFor(async () => {
      expect((await db.reminders.get("r-30"))?.deleted_at).toBeFalsy();
    });
  });

  it("adds nothing without a due date, offers whole-day presets for a date alone", async () => {
    const { user } = await open();
    await user.click(await screen.findByRole("button", { name: "Open Ship" }));
    const editor = await screen.findByRole("dialog", { name: "Edit card" });
    expect(within(reminders(editor)).getByText("Reminders need a due date.")).toBeInTheDocument();
    expect(within(reminders(editor)).queryByLabelText("Add reminder")).not.toBeInTheDocument();
    await user.type(within(editor).getByLabelText("Due date"), TOMORROW);
    const add = within(reminders(editor)).getByLabelText("Add reminder");
    const presets = within(add)
      .getAllByRole("option")
      .map((option) => option.textContent);
    expect(presets).toContain("1 day before at 09:00");
    expect(presets).not.toContain("15 minutes before");
  });

  it("lets a view share set its own reminders and saves only them", async () => {
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
    expect(within(viewer).getByLabelText("Title")).toBeDisabled();
    expect(within(viewer).queryByRole("button", { name: "Save" })).not.toBeInTheDocument();
    await user.selectOptions(within(reminders(viewer)).getByLabelText("Add reminder"), "1 hour before");
    await user.click(within(viewer).getByRole("button", { name: "Save" }));
    await screen.findByText("Saved Plan");
    const writes = (await outbox()).map((entry) => [entry.entity_type, entry.op, entry.data]);
    expect(writes).toEqual([["reminder", "create", { item_id: PLAN, offset_minutes: 60 }]]);
  });

  it("names the card and its board in the notification and opens the card on its board", async () => {
    const notes = [
      {
        id: "n-1",
        kind: "reminder",
        item_id: PLAN,
        created_at: new Date().toISOString(),
        read_at: null,
        payload: {
          reminder_id: "r-30",
          item_id: PLAN,
          kind: "card",
          title: "Plan",
          board_id: BOARD,
          board_name: "Revamp",
          due_date: TOMORROW,
          due_time: "09:30",
          tzid: ZONE,
          fire_at: new Date().toISOString(),
          late: false,
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
    await user.click(await screen.findByText("Reminder: Plan — Tomorrow, 09:30 · Revamp"));
    expect(await screen.findByRole("dialog", { name: "Edit card" })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe(`/kanban/${BOARD}`);
    await user.keyboard("{Escape}");
    await waitFor(() => {
      expect(router.state.location.search).not.toHaveProperty("card", PLAN);
    });
  });
});
