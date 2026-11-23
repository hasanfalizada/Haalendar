// +++===+++ 2026-11-23 22:10 +04 — Hasan Alizada — HAAL-104. The due date of a note in the interface (D-121): the card
// shows it, with "Overdue" / "Due soon" as a board's card does; the editor sets a date and a time, clearing the date
// clears the time, Save writes only what changed, and a new note is created with it.
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { addDays, todayIn } from "@/lib/datetime";
import { localDb } from "@/sync/db";

import { json, me, noPush, renderApp, stubApi } from "./fake-api";

const USER = me().id;
const TODAY = todayIn(me().time_zone);

const note = (id: string, title: string, extra: Record<string, unknown> = {}) => ({
  id,
  kind: "note",
  container_kind: "note",
  container_id: id,
  owner_id: USER,
  title,
  body: "",
  color: "yellow",
  priority: "medium",
  pinned: false,
  archived_at: null,
  position: `U${title}`,
  is_checklist: false,
  due_date: null,
  due_time: null,
  deleted_at: null,
  version: 2,
  ...extra,
});

const LATE = "0199f000-0000-7000-8000-0000000001d1";
const SOON = "0199f000-0000-7000-8000-0000000001d2";
const LATER = "0199f000-0000-7000-8000-0000000001d3";
const PLAIN = "0199f000-0000-7000-8000-0000000001d4";

async function open(rows: Record<string, unknown>[]) {
  const db = await localDb(USER);
  await db.items.bulkPut(rows);
  stubApi({ "GET /me": () => json(me()), "POST /sync/push": noPush });
  renderApp("/todo");
  await screen.findByRole("button", { name: /Account menu/ });
  return { user: userEvent.setup(), db };
}

async function outbox() {
  const db = await localDb(USER);
  return db.outbox.orderBy("seq").toArray();
}

describe("due date of a note", { timeout: 20_000 }, () => {
  it("the card shows the due date, overdue or due soon with a sign, plain when later", async () => {
    await open([
      note(LATE, "Taxes", { due_date: addDays(TODAY, -1), due_time: "09:00" }),
      note(SOON, "Call", { due_date: TODAY }),
      note(LATER, "Trip", { due_date: addDays(TODAY, 10) }),
      note(PLAIN, "Ideas"),
    ]);
    const late = await screen.findByRole("article", { name: "Taxes" });
    expect(within(late).getByText("Overdue")).toBeInTheDocument();
    expect(within(late).getByLabelText(/^Overdue, due .*09:00/)).toBeInTheDocument();
    const soon = screen.getByRole("article", { name: "Call" });
    expect(within(soon).getByLabelText(/^Due soon, /)).toBeInTheDocument();
    const later = screen.getByRole("article", { name: "Trip" });
    expect(within(later).getByLabelText(/^Due /)).toBeInTheDocument();
    expect(within(later).queryByText(/Overdue|Due soon/)).not.toBeInTheDocument();
    expect(within(screen.getByRole("article", { name: "Ideas" })).queryByLabelText(/^Due /)).not.toBeInTheDocument();
  });

  it("the editor sets a date and a time, clearing the date clears the time; Save writes what changed", async () => {
    const { user } = await open([note(PLAIN, "Ideas")]);
    await user.click(await screen.findByRole("button", { name: "Open Ideas" }));
    const editor = await screen.findByRole("dialog", { name: "Edit note" });
    const date = within(editor).getByLabelText("Due date");
    const time = within(editor).getByLabelText("Time (optional)");
    expect(time).toBeDisabled();
    await user.type(date, addDays(TODAY, -1));
    await user.type(time, "08:15");
    expect(within(editor).getByText("Overdue")).toBeInTheDocument();
    await user.click(within(editor).getByRole("button", { name: "Save" }));
    await screen.findByText("Saved Ideas");
    const [written] = await outbox();
    expect([written?.op, written?.base, written?.data]).toEqual([
      "update",
      { due_date: null, due_time: null },
      { due_date: addDays(TODAY, -1), due_time: "08:15" },
    ]);
    await waitFor(() => {
      expect(screen.queryByRole("dialog", { name: "Edit note" })).not.toBeInTheDocument();
    });

    await user.click(await screen.findByRole("button", { name: "Open Ideas" }));
    const again = await screen.findByRole("dialog", { name: "Edit note" });
    await user.click(within(again).getByRole("button", { name: "Clear due date" }));
    expect(within(again).getByLabelText("Time (optional)")).toHaveValue("");
    expect(within(again).getByLabelText("Time (optional)")).toBeDisabled();
    await user.click(within(again).getByRole("button", { name: "Save" }));
    await waitFor(async () => {
      expect((await outbox()).at(-1)?.data).toEqual({ due_date: null, due_time: null });
    });
  });

  it("a new note is created with its due date", async () => {
    const { user } = await open([]);
    await user.click(await screen.findByRole("button", { name: "New note" }));
    const editor = await screen.findByRole("dialog", { name: "New note" });
    await user.type(within(editor).getByLabelText("Title"), "Dentist");
    await user.type(within(editor).getByLabelText("Due date"), "2026-12-24");
    await user.click(within(editor).getByRole("button", { name: "Save" }));
    await screen.findByText("Created Dentist");
    const [created] = await outbox();
    expect(created?.op).toBe("create");
    expect(created?.data).toMatchObject({ kind: "note", title: "Dentist", due_date: "2026-12-24", due_time: null });
  });
});
