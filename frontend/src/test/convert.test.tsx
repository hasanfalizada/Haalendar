// +++===+++ 2026-11-25 17:09 +04 — Hasan Alizada — HAAL-122 (D-125, stage 2). "Convert to…" in the app: from the event
// details to a card on a board the user can change (the place goes into the description, the request carries the
// version, the column and a place at its end; the card opens where it now is; Undo converts it back with the batch and
// the title and description it had); a repeating event says why it cannot be converted; from the note editor to an
// event on the chosen day (the checklist becomes a list in the description) and from the card editor to a note (the
// card's assignees and comments are taken off; only after its changes are saved).
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { QueryClient } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";

import { localDb } from "@/sync/db";

import { type Call, json, me, noPush, renderApp, stubApi } from "./fake-api";

const USER = me().id;
const CAL = "0199f000-0000-7000-8000-0000000000c1";
const BOARD = "0199f000-0000-7000-8000-0000000000b1";
const TODO = "0199f000-0000-7000-8000-0000000000d1";
const DONE = "0199f000-0000-7000-8000-0000000000d2";
const EVENT = "0199f000-0000-7000-8000-0000000000e1";
const SERIES = "0199f000-0000-7000-8000-0000000000e2";
const NOTE = "0199f000-0000-7000-8000-0000000000a1";
const CARD = "0199f000-0000-7000-8000-0000000000a2";
const BATCH = "0199f000-0000-7000-8000-0000000000f9";
const DAY = "2026-11-10";

const event = {
  id: EVENT,
  kind: "event",
  owner_id: USER,
  container_kind: "calendar",
  container_id: CAL,
  title: "Dentist",
  color: "red",
  priority: "high",
  all_day: false,
  start_date: DAY,
  end_date: DAY,
  start_time: "11:00",
  end_time: "12:00",
  tzid: me().time_zone,
  rrule: null,
  location: "Main St 1",
  body: "Bring the card",
  deleted_at: null,
  version: 2,
};

const note = {
  id: NOTE,
  kind: "note",
  owner_id: USER,
  container_kind: "note",
  container_id: NOTE,
  title: "Packing",
  body: "",
  color: "brown",
  priority: "medium",
  pinned: false,
  archived_at: null,
  is_checklist: true,
  due_date: null,
  due_time: null,
  position: "M",
  deleted_at: null,
  version: 4,
};

const card = {
  id: CARD,
  kind: "card",
  owner_id: USER,
  container_kind: "board",
  container_id: BOARD,
  column_id: TODO,
  title: "Ship",
  body: "",
  color: "green",
  priority: "medium",
  position: "M",
  due_date: null,
  due_time: null,
  deleted_at: null,
  version: 3,
};

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

async function seed() {
  const db = await localDb(USER);
  await db.calendars.put({ id: CAL, name: "Work", owner_id: USER, is_default: true, deleted_at: null });
  await db.boards.put({
    id: BOARD,
    owner_id: USER,
    name: "Revamp",
    position: "U",
    archived_at: null,
    deleted_at: null,
  });
  await db.boardColumns.bulkPut([column(TODO, "To do", "C"), column(DONE, "Done", "M")]);
  await db.items.bulkPut([event, { ...event, id: SERIES, title: "Standup", rrule: "FREQ=DAILY" }, note, card]);
  await db.checklistItems.bulkPut(
    ["Socks", "Charger"].map((text, index) => ({
      id: `ci${String(index)}`,
      item_id: NOTE,
      container_kind: "note",
      container_id: NOTE,
      text,
      checked: index === 0,
      position: index === 0 ? "C" : "M",
      deleted_at: null,
    })),
  );
  await db.cardAssignees.put({
    id: "as1",
    item_id: CARD,
    user_id: USER,
    container_kind: "board",
    container_id: BOARD,
    deleted_at: null,
  });
  return db;
}

/** The server converts; the sync then brings the row of the new kind (written here as the pull would). */
async function open(path: string, converted: (call: Call) => Record<string, unknown>) {
  const db = await seed();
  let client: QueryClient | null = null;
  const calls = stubApi({
    "GET /me": () => json(me()),
    "POST /sync/push": noPush,
    "POST /items/*/convert": async (call) => {
      const row = converted(call);
      await db.items.put(row);
      await client?.invalidateQueries({ queryKey: ["local"] });
      return json({ item_id: row.id, kind: row.kind, version: Number(row.version), batch_id: BATCH });
    },
  });
  const app = renderApp(path);
  client = app.queryClient;
  await screen.findByRole("button", { name: /Account menu/ });
  return { user: userEvent.setup(), calls, db, router: app.router };
}

const converts = (calls: Call[]) => calls.filter((c) => c.method === "POST" && c.path.endsWith("/convert"));

describe("convert", { timeout: 20_000 }, () => {
  it("an event becomes a card on a board, opens there, and Undo converts it back", async () => {
    const { user, calls, router } = await open(`/calendar?date=${DAY}&view=day`, (call) => {
      const body = call.body as Record<string, unknown>;
      return body.target_kind === "card"
        ? { ...event, kind: "card", container_kind: "board", container_id: BOARD, column_id: DONE, version: 3 }
        : { ...event, version: 4 };
    });
    await user.click(await screen.findByRole("button", { name: "Details of Dentist" }));
    const details = await screen.findByRole("dialog", { name: "Event details" });
    await user.click(within(details).getByRole("button", { name: "Convert to…" }));

    const dialog = await screen.findByRole("dialog", { name: "Convert Dentist" });
    const kind = within(dialog).getByLabelText("Convert to");
    expect(
      within(kind)
        .getAllByRole("option")
        .map((o) => o.textContent),
    ).toEqual(["A note", "A card"]);
    await user.selectOptions(kind, "card");
    expect(within(dialog).getByLabelText("Board")).toHaveValue(BOARD);
    await user.selectOptions(within(dialog).getByLabelText("Column"), DONE);
    expect(dialog).toHaveTextContent("The place “Main St 1” goes into the first line of the description.");
    await user.click(within(dialog).getByRole("button", { name: "Convert" }));

    const toast = await screen.findByText("Dentist is now a card.");
    expect(converts(calls)[0]?.body).toMatchObject({
      target_kind: "card",
      version: 2,
      board_id: BOARD,
      column_id: DONE,
      position: expect.any(String) as unknown,
    });
    const opened = await screen.findByRole("dialog", { name: "Edit card" });
    expect(within(opened).getByLabelText("Title")).toHaveValue("Dentist");
    expect(router.state.location.pathname).toBe(`/kanban/${BOARD}`);
    await user.keyboard("{Escape}");

    await user.click(within(toast.closest("li") ?? document.body).getByRole("button", { name: "Undo" }));
    await waitFor(() => {
      expect(converts(calls)).toHaveLength(2);
    });
    expect(converts(calls)[1]?.body).toEqual({
      target_kind: "event",
      undo: BATCH,
      title: "Dentist",
      body: "Bring the card",
    });
  });

  it("a repeating event says why it cannot be converted", async () => {
    const { user, calls } = await open(`/calendar?date=${DAY}&view=day`, () => event);
    await user.click((await screen.findAllByRole("button", { name: "Details of Standup" }))[0] as HTMLElement);
    const details = await screen.findByRole("dialog", { name: "Event details" });
    await user.click(within(details).getByRole("button", { name: "Convert to…" }));
    const dialog = await screen.findByRole("dialog", { name: "Convert Standup" });
    expect(dialog).toHaveTextContent("A repeating event cannot be converted.");
    expect(within(dialog).queryByRole("button", { name: "Convert" })).not.toBeInTheDocument();
    expect(converts(calls)).toHaveLength(0);
  });

  it("a note becomes an event on the chosen day; its checklist goes into the description", async () => {
    const { user, calls } = await open("/todo", () => ({
      ...note,
      kind: "event",
      container_kind: "calendar",
      container_id: CAL,
      start_date: "2026-11-12",
      end_date: "2026-11-12",
      all_day: true,
      start_time: null,
      end_time: null,
      tzid: me().time_zone,
      rrule: null,
      location: null,
      version: 5,
    }));
    await user.click(await screen.findByRole("button", { name: "Open Packing" }));
    const editor = await screen.findByRole("dialog", { name: "Edit note" });
    await user.click(within(editor).getByRole("button", { name: "Convert to…" }));
    const dialog = await screen.findByRole("dialog", { name: "Convert Packing" });
    expect(within(dialog).getByLabelText("Convert to")).toHaveValue("event");
    expect(within(dialog).getByLabelText("Calendar")).toHaveValue(CAL);
    expect(dialog).toHaveTextContent("The checklist (2 items) becomes a list in the description.");
    const day = within(dialog).getByLabelText("Day");
    await user.clear(day);
    await user.type(day, "2026-11-12");
    await user.click(within(dialog).getByRole("button", { name: "Convert" }));

    await screen.findByText("Packing is now an event.");
    expect(converts(calls)[0]?.body).toEqual({
      target_kind: "event",
      version: 4,
      calendar_id: CAL,
      start_date: "2026-11-12",
    });
    expect(await screen.findByRole("dialog", { name: "Event details" })).toHaveTextContent("Packing");
  });

  it("a card becomes a note once its changes are saved; its assignees are taken off", async () => {
    const { user, calls } = await open(`/kanban/${BOARD}`, (call) => ({
      ...card,
      kind: "note",
      container_kind: "note",
      container_id: CARD,
      position: (call.body as Record<string, unknown>).position,
      version: 4,
    }));
    await user.click(await screen.findByRole("button", { name: "Open Ship" }));
    const editor = await screen.findByRole("dialog", { name: "Edit card" });
    const title = within(editor).getByLabelText("Title");
    await user.type(title, "!");
    expect(within(editor).getByRole("button", { name: "Convert to…" })).toBeDisabled();
    await user.clear(title);
    await user.type(title, "Ship");
    await user.click(within(editor).getByRole("button", { name: "Convert to…" }));
    const dialog = await screen.findByRole("dialog", { name: "Convert Ship" });
    await user.selectOptions(within(dialog).getByLabelText("Convert to"), "note");
    expect(dialog).toHaveTextContent("1 person assigned is taken off.");
    await user.click(within(dialog).getByRole("button", { name: "Convert" }));

    await screen.findByText("Ship is now a note.");
    expect(converts(calls)[0]?.body).toMatchObject({ target_kind: "note", version: 3 });
    expect(await screen.findByRole("dialog", { name: "Edit note" })).toBeInTheDocument();
  });
});
