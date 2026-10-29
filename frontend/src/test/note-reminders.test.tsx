// +++===+++ 2026-10-29 — Hasan Alizada — HAAL-105. Reminders on notes in the interface (FR-TODO-07, D-89): the card shows
// a bell with the next reminder still ahead; the editor adds one by date and time (still ahead, no duplicate), shows a
// passed one greyed, removes one, and Save writes them with the note in one undo step; a note's reminder notification
// reads "Reminder: Shopping — Tomorrow, 09:00" and opens the note on the To-Do page.
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { addDays, todayIn } from "@/lib/datetime";
import { atFromLocal } from "@/lib/reminders";
import { localDb } from "@/sync/db";

import { json, me, renderApp, stubApi } from "./fake-api";

const USER = me().id;
const ZONE = me().time_zone;
const SHOPPING = "0199f000-0000-7000-8000-0000000000d1";
const TODAY = todayIn(ZONE);
const TOMORROW = addDays(TODAY, 1);
const at = (day: string, time: string) => String(atFromLocal(day, time, ZONE));

const note = {
  id: SHOPPING,
  kind: "note",
  container_kind: "note",
  container_id: SHOPPING,
  title: "Shopping",
  body: "Milk",
  color: "yellow",
  priority: "medium",
  pinned: false,
  archived_at: null,
  position: "U",
  is_checklist: false,
  deleted_at: null,
  version: 2,
};

const reminder = (id: string, remindAt: string) => ({
  id,
  item_id: SHOPPING,
  owner_id: USER,
  offset_minutes: null,
  all_day_time: null,
  all_day_days_before: null,
  remind_at: remindAt,
  deleted_at: null,
  version: 1,
});

async function open(extra: Parameters<typeof stubApi>[0] = {}, path = "/todo") {
  const db = await localDb(USER);
  await db.items.put(note);
  await db.reminders.bulkPut([
    reminder("r-next", at(TOMORROW, "09:00")),
    reminder("r-later", at(addDays(TODAY, 2), "09:00")),
    reminder("r-passed", at(addDays(TODAY, -1), "09:00")),
  ]);
  stubApi({
    "GET /me": () => json(me()),
    "POST /sync/push": () => new Promise<Response>(() => undefined),
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

describe("reminders on notes", { timeout: 20_000 }, () => {
  it("the card shows the next reminder still ahead", async () => {
    await open();
    const card = await screen.findByRole("article", { name: "Shopping" });
    expect(await within(card).findByText("Tomorrow, 09:00")).toBeInTheDocument();
  });

  it("the editor adds one ahead, refuses a passed or a doubled time, removes one; Save writes them in one step", async () => {
    const { user, db } = await open();
    await user.click(await screen.findByRole("button", { name: "Open Shopping" }));
    const editor = await screen.findByRole("dialog", { name: "Edit note" });
    const section = within(editor).getByRole("region", { name: "Reminders" });
    expect(await within(section).findByText("Tomorrow, 09:00")).toBeInTheDocument();
    expect(within(section).getByText("(passed)")).toBeInTheDocument();

    const date = within(section).getByLabelText("Date");
    const time = within(section).getByLabelText("Time");
    await user.clear(date);
    await user.type(date, addDays(TODAY, -2));
    await user.click(within(section).getByRole("button", { name: "Add reminder" }));
    expect(within(section).getByText("Choose a time that is still ahead.")).toBeInTheDocument();
    await user.clear(date);
    await user.type(date, TOMORROW);
    await user.clear(time);
    await user.type(time, "09:00");
    await user.click(within(section).getByRole("button", { name: "Add reminder" }));
    expect(within(section).getByText("This reminder is already set.")).toBeInTheDocument();
    await user.clear(time);
    await user.type(time, "18:30");
    await user.click(within(section).getByRole("button", { name: "Add reminder" }));
    expect(within(section).getByText("Tomorrow, 18:30")).toBeInTheDocument();
    await user.click(within(section).getByRole("button", { name: "Remove the reminder Tomorrow, 09:00" }));
    await user.click(within(editor).getByRole("button", { name: "Save" }));

    const toast = await screen.findByText("Saved Shopping");
    const writes = (await outbox()).map((entry) => [entry.entity_type, entry.op, entry.entity_id, entry.data]);
    expect(writes).toEqual([
      ["reminder", "delete", "r-next", undefined],
      ["reminder", "create", expect.any(String), { item_id: SHOPPING, remind_at: at(TOMORROW, "18:30") }],
    ]);
    // The modal editor blocks the page until it has closed.
    await waitFor(() => {
      expect(screen.queryByRole("dialog", { name: "Edit note" })).not.toBeInTheDocument();
    });
    await user.click(within(toast.closest("li") ?? document.body).getByRole("button", { name: "Undo" }));
    await waitFor(async () => {
      expect((await db.reminders.get("r-next"))?.deleted_at).toBeFalsy();
    });
  });

  it("a note's reminder notification names it and opens it on the To-Do page", async () => {
    const notes = [
      {
        id: "n-1",
        kind: "reminder",
        item_id: SHOPPING,
        created_at: new Date().toISOString(),
        read_at: null,
        payload: {
          reminder_id: "r-next",
          item_id: SHOPPING,
          kind: "note",
          title: "Shopping",
          fire_at: at(TOMORROW, "09:00"),
          late: false,
        },
      },
    ];
    const { user, router } = await open(
      {
        "GET /notifications": () => json({ data: notes, unread_count: 1, next_cursor: null }),
        "POST /notifications/read": () => new Response(null, { status: 204 }),
      },
      "/calendar",
    );
    await user.click(await screen.findByRole("button", { name: /^Notifications/ }));
    await user.click(await screen.findByText("Reminder: Shopping — Tomorrow, 09:00"));
    expect(await screen.findByRole("dialog", { name: "Edit note" })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe("/todo");
    await user.keyboard("{Escape}");
    await waitFor(() => {
      expect(router.state.location.search).not.toHaveProperty("note", SHOPPING);
    });
  });
});
