// +++===+++ 2026-11-07 — Hasan Alizada — HAAL-145 (UAT finding F6). Bulk actions (FR-X-07, D-41) on the day list, the
// notes and a board: the bar offers colour, priority and delete (the day list also the move); a delete asks first; the
// writes go through the outbox (offline too) as one action with one notification and one undo step; in the day list
// the Delete key deletes the whole selection and an occurrence of a series leaves only that date.
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { localDb } from "@/sync/db";

import { json, me, renderApp, stubApi } from "./fake-api";

const USER = me().id;
const CAL = "0199f000-0000-7000-8000-0000000000c1";
const SERIES = "0199f000-0000-7000-8000-0000000000e1";
const ONCE = "0199f000-0000-7000-8000-0000000000e2";
const SHOPPING = "0199f000-0000-7000-8000-0000000000a1";
const IDEAS = "0199f000-0000-7000-8000-0000000000a2";
const BOARD = "0199f000-0000-7000-8000-0000000000b1";
const TODO = "0199f000-0000-7000-8000-0000000000d1";
const PLAN = "0199f000-0000-7000-8000-0000000000f1";
const SHIP = "0199f000-0000-7000-8000-0000000000f2";
const DAY = "2026-11-10";

const event = (id: string, title: string, extra: Record<string, unknown> = {}) => ({
  id,
  kind: "event",
  container_kind: "calendar",
  container_id: CAL,
  title,
  color: "green",
  priority: "medium",
  all_day: false,
  start_date: DAY,
  end_date: DAY,
  start_time: "10:00",
  end_time: "11:00",
  tzid: me().time_zone,
  rrule: null,
  exceptions: [],
  deleted_at: null,
  version: 2,
  ...extra,
});

const note = (id: string, title: string, position: string) => ({
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
  position,
  deleted_at: null,
  version: 3,
});

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

async function open(path: string) {
  const db = await localDb(USER);
  await db.calendars.put({ id: CAL, name: "Work", owner_id: USER, deleted_at: null });
  await db.items.bulkPut([
    event(SERIES, "Standup", { start_date: "2026-11-03", end_date: "2026-11-03", rrule: "FREQ=DAILY" }),
    event(ONCE, "Dentist", { start_time: "14:00", end_time: "15:00" }),
    note(SHOPPING, "Shopping", "M"),
    note(IDEAS, "Ideas", "C"),
    card(PLAN, "Plan", "C"),
    card(SHIP, "Ship", "M"),
  ]);
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
  // Pushes never answer here, so the outbox keeps what the page wrote.
  stubApi({ "GET /me": () => json(me()), "POST /sync/push": () => new Promise<Response>(() => undefined) });
  renderApp(path);
  await screen.findByRole("button", { name: /Account menu/ });
  return { user: userEvent.setup(), db };
}

async function outbox() {
  const db = await localDb(USER);
  return (await db.outbox.orderBy("seq").toArray()).map((entry) => ({
    id: entry.entity_id,
    op: entry.op,
    data: entry.data,
  }));
}

const bar = () => screen.getByRole("toolbar", { name: "Bulk actions" });

describe("bulk actions", () => {
  it("day list: Delete deletes the whole selection after asking; an occurrence leaves its series; one undo", async () => {
    const { user } = await open(`/calendar?date=${DAY}`);
    await screen.findByRole("button", { name: "Details of Dentist" });
    await user.keyboard("{Control>}a{/Control}");
    expect(within(bar()).getByText("2 of 2 selected")).toBeInTheDocument();
    for (const name of ["Color", "Priority", "Move to next day", "Delete selected"]) {
      expect(within(bar()).getByRole("button", { name })).toBeInTheDocument();
    }
    screen.getByRole("button", { name: "Details of Dentist" }).focus();
    await user.keyboard("{Delete}");
    const dialog = await screen.findByRole("dialog", { name: "Delete 2 items?" });
    await user.click(within(dialog).getByRole("button", { name: "Delete" }));
    expect(await screen.findByText("Deleted 2 items.")).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(await outbox()).toEqual([
      { id: SERIES, op: "exclude", data: { occurrence_date: DAY } },
      expect.objectContaining({ id: ONCE, op: "delete" }),
    ]);
    await user.keyboard("{Control>}z{/Control}");
    await waitFor(async () => {
      const db = await localDb(USER);
      expect((await db.items.get(ONCE))?.deleted_at).toBeFalsy();
      expect((await db.items.get(SERIES))?.exceptions).not.toContain(DAY);
    });
  });

  it("day list: a colour for every selected event in one step", async () => {
    const { user, db } = await open(`/calendar?date=${DAY}`);
    await user.click(await screen.findByRole("checkbox", { name: "Select Dentist" }));
    await user.click(screen.getByRole("checkbox", { name: "Select Standup" }));
    await user.click(within(bar()).getByRole("button", { name: "Color" }));
    await user.click(await screen.findByRole("menuitem", { name: "Red" }));
    expect(await screen.findByText("Changed the color of 2 items.")).toBeInTheDocument();
    expect((await db.items.get(ONCE))?.color).toBe("red");
    expect((await db.items.get(SERIES))?.color).toBe("red");
    await user.keyboard("{Control>}z{/Control}");
    await waitFor(async () => {
      expect((await db.items.get(ONCE))?.color).toBe("green");
      expect((await db.items.get(SERIES))?.color).toBe("green");
    });
  });

  it("notes: select with the checkboxes, set the priority and delete", async () => {
    const { user, db } = await open("/todo");
    await user.click(await screen.findByRole("checkbox", { name: "Select Shopping" }));
    await user.click(screen.getByRole("checkbox", { name: "Select Ideas" }));
    expect(within(bar()).getByText("2 of 2 selected")).toBeInTheDocument();
    await user.click(within(bar()).getByRole("button", { name: "Priority" }));
    await user.click(await screen.findByRole("menuitem", { name: /High/ }));
    expect(await screen.findByText("Changed the priority of 2 items.")).toBeInTheDocument();
    expect((await db.items.get(SHOPPING))?.priority).toBe("high");
    expect((await db.items.get(IDEAS))?.priority).toBe("high");

    await user.click(within(bar()).getByRole("button", { name: "Delete selected" }));
    const dialog = await screen.findByRole("dialog", { name: "Delete 2 items?" });
    await user.click(within(dialog).getByRole("button", { name: "Delete" }));
    expect(await screen.findByText("Deleted 2 items.")).toBeInTheDocument();
    expect((await db.items.get(SHOPPING))?.deleted_at).toBeTruthy();
    expect((await db.items.get(IDEAS))?.deleted_at).toBeTruthy();
  });

  it("board: Ctrl+click selects cards, the bar deletes them", async () => {
    const { user, db } = await open(`/kanban/${BOARD}`);
    await user.click(await screen.findByRole("checkbox", { name: "Select Plan" }));
    await user.keyboard("{Control>}");
    await user.click(screen.getByRole("button", { name: "Open Ship" }));
    await user.keyboard("{/Control}");
    expect(within(bar()).getByText("2 of 2 selected")).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    await user.click(within(bar()).getByRole("button", { name: "Delete selected" }));
    await user.click(
      within(await screen.findByRole("dialog", { name: "Delete 2 items?" })).getByRole("button", {
        name: "Delete",
      }),
    );
    expect(await screen.findByText("Deleted 2 items.")).toBeInTheDocument();
    expect((await db.items.get(PLAN))?.deleted_at).toBeTruthy();
    expect((await db.items.get(SHIP))?.deleted_at).toBeTruthy();
  });
});
