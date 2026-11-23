// +++===+++ 2026-11-23 13:20 +04 — Hasan Alizada — HAAL-039 and HAAL-046 (D-119, D-120). The search window in the app:
// the header's field and "/" open it, results by module with the words marked and where they were found, arrow keys and
// Enter open a result, a date opens its day, the filters narrow the results and list them without words,
// Reset, nothing found.
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { localDb } from "@/sync/db";

import { json, me, noPush, renderApp, stubApi } from "./fake-api";

const USER = me().id;
const CAL = "0199f000-0000-7000-8000-0000000000c1";
const BOARD = "0199f000-0000-7000-8000-0000000000b1";
const DENTIST = "0199f000-0000-7000-8000-0000000000e1";
const YOGA = "0199f000-0000-7000-8000-0000000000e2";
const NOTE = "0199f000-0000-7000-8000-0000000000a1";
const CARD = "0199f000-0000-7000-8000-0000000000a2";
const LABEL = "0199f000-0000-7000-8000-0000000000f1";

const event = (id: string, title: string, fields: Record<string, unknown> = {}) => ({
  id,
  kind: "event",
  container_kind: "calendar",
  container_id: CAL,
  title,
  color: "brown",
  all_day: true,
  start_date: "2026-11-25",
  end_date: "2026-11-25",
  start_time: null,
  end_time: null,
  tzid: "Europe/Berlin",
  rrule: null,
  location: null,
  deleted_at: null,
  version: 1,
  ...fields,
});

async function open() {
  window.localStorage.clear();
  const db = await localDb(USER);
  await db.calendars.put({ id: CAL, name: "Work", owner_id: USER, deleted_at: null });
  await db.items.bulkPut([
    event(DENTIST, "Dentist", { color: "red", location: "Café Central" }),
    event(YOGA, "Yoga", { start_date: "2026-12-14", end_date: "2026-12-14", color: "green" }),
    {
      id: NOTE,
      kind: "note",
      container_kind: "note",
      container_id: NOTE,
      title: "Groceries",
      body: "",
      deleted_at: null,
      version: 1,
    },
    {
      id: CARD,
      kind: "card",
      container_kind: "board",
      container_id: BOARD,
      title: "Paint the door",
      priority: "high",
      deleted_at: null,
      version: 1,
    },
  ]);
  await db.checklistItems.put({ id: "ci1", item_id: NOTE, text: "Oat milk", deleted_at: null, version: 1 });
  await db.boards.put({
    id: BOARD,
    owner_id: USER,
    name: "Home",
    position: "U",
    archived_at: null,
    deleted_at: null,
    version: 1,
  });
  await db.labels.put({ id: LABEL, name: "Errands", color: "blue", deleted_at: null, version: 1 });
  await db.itemLabels.put({ id: "il1", item_id: NOTE, label_id: LABEL, deleted_at: null, version: 1 });
  stubApi({ "GET /me": () => json(me()), "POST /sync/push": noPush });
  const { router } = renderApp("/calendar?date=2026-11-24&view=day");
  await screen.findByRole("button", { name: /Account menu/ });
  return { user: userEvent.setup(), router };
}

const options = (group: string) =>
  within(screen.getByRole("group", { name: group }))
    .getAllByRole("option")
    .map((option) => option.textContent);

describe("the search window", { timeout: 20_000 }, () => {
  it("finds by the words, marks them, opens an event on its day", async () => {
    const { user, router } = await open();
    await user.click(within(screen.getByRole("main")).getByRole("button", { name: "Search" }));
    const box = await screen.findByRole("combobox", { name: "Search" });
    expect(box).toHaveFocus();
    expect(screen.getByText(/A date as YYYY-MM-DD opens that day/)).toBeInTheDocument();

    await user.type(box, "cafe");
    await waitFor(() => {
      expect(options("Calendar")).toEqual([expect.stringContaining("Dentist")]);
    });
    expect(options("Calendar")[0]).toContain("Place: Café Central");
    expect(screen.getByText("Café", { selector: "mark" })).toBeInTheDocument();

    await user.clear(box);
    await user.type(box, "milk");
    await waitFor(() => {
      expect(options("To-Do")).toEqual([expect.stringContaining("Checklist: Oat milk")]);
    });
    await user.clear(box);
    await user.type(box, "paint");
    await waitFor(() => {
      expect(options("Boards")).toEqual([expect.stringContaining("Home")]);
    });

    // Enter opens the active result (a note here: an event on its day with its card is checked end to end, F-30 —
    // opening /calendar?event= runs out of memory under jsdom, proposal P14).
    await user.clear(box);
    await user.type(box, "groceries{Enter}");
    await waitFor(() => {
      expect(router.state.location.pathname).toBe("/todo");
    });
    expect(router.state.location.search).toMatchObject({ note: NOTE });
    expect(screen.queryByRole("combobox", { name: "Search" })).not.toBeInTheDocument();
  });

  it("opens a typed date, says when nothing is found, and moves with the arrow keys", async () => {
    const { user, router } = await open();
    await user.keyboard("/");
    const box = await screen.findByRole("combobox", { name: "Search" });
    await user.type(box, "zzz");
    expect(await screen.findByText("Nothing found for “zzz”.")).toBeInTheDocument();

    await user.clear(box);
    await user.type(box, "d");
    await waitFor(() => {
      expect(screen.getAllByRole("option").length).toBeGreaterThan(1);
    });
    const [first, second] = screen.getAllByRole("option");
    expect(first).toHaveAttribute("aria-selected", "true");
    await user.keyboard("{ArrowDown}");
    expect(second).toHaveAttribute("aria-selected", "true");
    await user.keyboard("{ArrowUp}{ArrowUp}");
    expect(screen.getAllByRole("option").at(-1)).toHaveAttribute("aria-selected", "true");

    await user.clear(box);
    await user.type(box, "2027-03-09");
    expect(await screen.findByRole("option", { name: "Go to Tuesday, March 9, 2027" })).toBeInTheDocument();
    await user.keyboard("{Enter}");
    await waitFor(() => {
      expect(router.state.location.search).toMatchObject({ date: "2027-03-09", view: "day" });
    });
  });

  it("narrows by the filters, lists by them without words, and resets", async () => {
    const { user } = await open();
    await user.keyboard("/");
    await screen.findByRole("combobox", { name: "Search" });
    const filters = screen.getByRole("group", { name: "Filters" });

    await user.click(within(filters).getByRole("button", { name: "Colour" }));
    await user.click(await screen.findByRole("menuitemcheckbox", { name: "Red" }));
    await user.keyboard("{Escape}");
    await waitFor(() => {
      expect(options("Calendar")).toEqual([expect.stringContaining("Dentist")]);
    });
    expect(within(filters).getByRole("button", { name: "Colour · 1" })).toBeInTheDocument();

    await user.click(within(filters).getByRole("button", { name: "Reset" }));
    await user.click(within(filters).getByRole("button", { name: "Label" }));
    await user.click(await screen.findByRole("menuitemcheckbox", { name: "Errands" }));
    await user.keyboard("{Escape}");
    await waitFor(() => {
      expect(options("To-Do")).toEqual([expect.stringContaining("Groceries")]);
    });
    expect(screen.queryByRole("group", { name: "Calendar" })).not.toBeInTheDocument();

    await user.click(within(filters).getByRole("button", { name: "Reset" }));
    await user.click(within(filters).getByRole("button", { name: "Priority" }));
    await user.click(await screen.findByRole("menuitemcheckbox", { name: "High" }));
    await user.keyboard("{Escape}");
    await waitFor(() => {
      expect(options("Boards")).toEqual([expect.stringContaining("Paint the door")]);
    });

    await user.click(within(filters).getByRole("button", { name: "Reset" }));
    await user.click(within(filters).getByRole("button", { name: "Module" }));
    await user.click(await screen.findByRole("menuitemcheckbox", { name: "Calendar" }));
    await user.keyboard("{Escape}");
    await user.click(within(filters).getByRole("button", { name: "Dates" }));
    await user.click(await screen.findByRole("menuitem", { name: "Choose dates…" }));
    const from = await screen.findByLabelText("From");
    const to = screen.getByLabelText("To");
    await user.clear(to);
    await user.type(to, "2026-12-31");
    await user.clear(from);
    await user.type(from, "2026-12-01");
    await waitFor(() => {
      expect(options("Calendar")).toEqual([expect.stringContaining("Yoga")]);
    });

    await user.click(within(filters).getByRole("button", { name: "Reset" }));
    await user.click(within(filters).getByRole("button", { name: "Dates" }));
    await user.click(await screen.findByRole("menuitemcheckbox", { name: "Next 30 days" }));
    await user.keyboard("{Escape}");
    expect(within(filters).getByRole("button", { name: "Next 30 days" })).toBeInTheDocument();
    await user.click(within(filters).getByRole("button", { name: "Reset" }));
    expect(await screen.findByText(/A date as YYYY-MM-DD opens that day/)).toBeInTheDocument();
  });
});
