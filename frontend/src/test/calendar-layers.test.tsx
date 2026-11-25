// +++===+++ 2026-11-24 11:00 +04 — Hasan Alizada — HAAL-121. The layers of due dates in the calendar (FR-CAL-24, D-122):
// the due dates of notes and cards in the day list, the week's all-day row, the month and the agenda; overdue said in
// words; a click opens the note or the card; "Layers" in the sidebar hides one (the setting hidden_layers).
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { localDb } from "@/sync/db";

import { json, me, noPush, renderApp, settings, stubApi } from "./fake-api";
import { stubMatchMedia } from "./setup";

const USER = me().id;
const DAY = "2026-11-10";
const MINE = "0199f000-0000-7000-8000-0000000000c1";
const BOARD = "0199f000-0000-7000-8000-0000000000b1";
const NOTE = "0199f000-0000-7000-8000-0000000000a1";
const CARD = "0199f000-0000-7000-8000-0000000000d1";

const rows = [
  {
    id: "e1",
    kind: "event",
    container_kind: "calendar",
    container_id: MINE,
    title: "Dentist",
    color: "green",
    priority: "medium",
    all_day: true,
    start_date: DAY,
    end_date: DAY,
    start_time: null,
    end_time: null,
    tzid: me().time_zone,
    rrule: null,
    location: null,
    body: null,
    deleted_at: null,
    version: 1,
  },
  {
    id: NOTE,
    kind: "note",
    container_kind: "note",
    container_id: NOTE,
    title: "Taxes",
    due_date: DAY,
    due_time: null,
    archived_at: null,
    deleted_at: null,
    version: 1,
  },
  {
    id: CARD,
    kind: "card",
    container_kind: "board",
    container_id: BOARD,
    title: "Paint the fence",
    due_date: DAY,
    due_time: "09:30",
    deleted_at: null,
    version: 1,
  },
];

beforeEach(() => {
  // Desktop: the sidebar with the list is on the page.
  vi.stubGlobal(
    "matchMedia",
    vi.fn((query: string) => {
      const min = /min-width:\s*(\d+)px/.exec(query);
      return {
        matches: min ? 1280 >= Number(min[1]) : false,
        media: query,
        onchange: null,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        addListener: vi.fn(),
        removeListener: vi.fn(),
        dispatchEvent: vi.fn(),
      };
    }),
  );
});

afterEach(() => {
  stubMatchMedia(false);
});

async function open(view: string, extra: Parameters<typeof stubApi>[0] = {}) {
  const db = await localDb(USER);
  await db.calendars.put({
    id: MINE,
    name: "My calendar",
    color: "blue",
    owner_id: USER,
    is_default: true,
    deleted_at: null,
  });
  await db.boards.put({ id: BOARD, name: "Home", owner_id: USER, archived_at: null, deleted_at: null });
  await db.items.bulkPut(rows);
  stubApi({
    "GET /me": () => json(me()),
    "POST /sync/push": noPush,
    "GET /me/settings": () => json(settings()),
    ...extra,
  });
  const { router } = renderApp(`/calendar?date=${DAY}&view=${view}`);
  const sidebar = await screen.findByRole("complementary", { name: "Calendar sidebar" });
  return { user: userEvent.setup(), router, sidebar };
}

const NOTE_LABEL = /^Open the note Taxes, due all day, overdue$/;
const CARD_LABEL = /^Open the card Paint the fence, due 09:30, overdue$/;

describe("layers of due dates", { timeout: 20_000 }, () => {
  it("the day list shows the due dates above the events; a click opens the note", async () => {
    const { user, router } = await open("day");
    const dues = await screen.findByRole("list", { name: "Due on Tuesday, November 10, 2026" });
    expect(
      within(dues)
        .getAllByRole("button")
        .map((button) => button.getAttribute("aria-label")),
    ).toEqual(["Open the note Taxes, due all day, overdue", "Open the card Paint the fence, due 09:30, overdue"]);
    expect(within(dues).getAllByText("Overdue")).toHaveLength(2);
    expect(screen.getByRole("button", { name: "Details of Dentist" })).toBeInTheDocument();

    await user.click(within(dues).getByRole("button", { name: NOTE_LABEL }));
    await waitFor(() => {
      expect(router.state.location.pathname).toBe("/todo");
    });
    expect(router.state.location.search).toMatchObject({ note: NOTE });
  });

  it("the week's all-day row shows them, the time before the title", async () => {
    await open("week");
    const allDay = await screen.findByRole("list", { name: "All day, Tuesday, November 10, 2026" });
    expect(within(allDay).getByRole("button", { name: CARD_LABEL })).toHaveTextContent("09:30Paint the fence");
    expect(within(allDay).getByRole("button", { name: NOTE_LABEL })).toBeInTheDocument();
  });

  it("the month shows them after the day's events", async () => {
    await open("month");
    const cell = await screen.findByRole("list", { name: "Tuesday, November 10, 2026" });
    // +++===+++ 2026-11-25 09:48 +04 — Hasan Alizada — HAAL-114 (check run). The cell is there before the rows of the
    // device are: waited for, not read at once (failed 1 run in 5).
    expect(await within(cell).findByRole("button", { name: "Details of Dentist" })).toBeInTheDocument();
    expect(await within(cell).findByRole("button", { name: NOTE_LABEL })).toBeInTheDocument();
  });

  it("the agenda lists them above the day's events", async () => {
    await open("agenda");
    const dues = await screen.findByRole("list", { name: "Due on Tuesday, November 10, 2026" });
    expect(await within(dues).findByRole("button", { name: CARD_LABEL })).toBeInTheDocument();
  });

  it("Layers hides the due dates of notes: the setting is saved and they go", async () => {
    let saved: unknown = null;
    const { user, sidebar } = await open("day", {
      "PATCH /me/settings": (call) => {
        saved = call.body;
        return json(settings({ hidden_layers: ["note_due"], version: 2 }));
      },
    });
    const layers = within(sidebar).getByRole("region", { name: "Layers" });
    const notes = within(layers).getByRole("checkbox", { name: "Show Note due dates" });
    expect(notes).toBeChecked();
    expect(within(layers).getByRole("checkbox", { name: "Show Card due dates" })).toBeChecked();
    expect(await screen.findByRole("button", { name: NOTE_LABEL })).toBeInTheDocument();
    await user.click(notes);
    await waitFor(() => {
      expect(screen.queryByRole("button", { name: NOTE_LABEL })).not.toBeInTheDocument();
    });
    expect(saved).toEqual({ hidden_layers: ["note_due"] });
    expect(screen.getByRole("button", { name: CARD_LABEL })).toBeInTheDocument();
    expect(notes).not.toBeChecked();
  });
});
