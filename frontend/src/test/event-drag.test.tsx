// +++===+++ 2026-10-28 — Hasan Alizada — HAAL-090. Drag and drop (FR-CAL-28, D-78) through the real drag layer: jsdom
// lays nothing out, so every drop zone (data-drop) and event button gets a box here — month days in a 7-column grid of
// 100 px cells, week time columns 100 px wide with 0.8 px a minute. A month drop keeps the times, a week drop takes the
// new start in 15-minute steps and keeps the length, a series asks "only this or all", one undo brings it back, a
// short drag (a click) opens the card instead, and view-only events do not move.
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { localDb } from "@/sync/db";

import { json, me, renderApp, stubApi } from "./fake-api";
import { stubMatchMedia } from "./setup";

const USER = me().id;
const OWN = "0199f000-0000-7000-8000-0000000000c1";
const SHARED = "0199f000-0000-7000-8000-0000000000c2";
const MONTH_START = "2026-09-28"; // first day of the October 2026 grid (weeks from Monday)
const WEEK_START = "2026-10-26";

function days(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}

function rect(left: number, top: number, width: number, height: number): DOMRect {
  return { left, top, width, height, right: left + width, bottom: top + height, x: left, y: top, toJSON: () => ({}) };
}

/** Boxes for the drop zones and the events in them (see the header). */
function zoneBox(id: string): DOMRect | null {
  const [kind, day = ""] = id.split(":");
  if (kind === "day") {
    const index = days(MONTH_START, day);
    return rect((index % 7) * 100, 100 + Math.floor(index / 7) * 100, 100, 100);
  }
  if (kind === "time") return rect(100 + days(WEEK_START, day) * 100, 200, 100, 24 * 48);
  if (kind === "allday") return rect(100 + days(WEEK_START, day) * 100, 150, 100, 40);
  return null;
}

beforeEach(() => {
  vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(function (this: Element) {
    if (!(this instanceof HTMLElement)) return rect(0, 0, 0, 0);
    const own = this.dataset.drop ? zoneBox(this.dataset.drop) : null;
    if (own) return own;
    const zone = this.closest<HTMLElement>("[data-drop]");
    const box = zone?.dataset.drop ? zoneBox(zone.dataset.drop) : null;
    if (!box || this.tagName !== "BUTTON") return rect(0, 0, 0, 0);
    const item = this.closest("li");
    const top = item?.style.top ? box.top + parseFloat(item.style.top) : box.top + 30;
    const height = item?.style.height ? parseFloat(item.style.height) : 20;
    return rect(box.left + 2, top, 96, height);
  });
  // Desktop: popovers, week grid with text.
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
  vi.restoreAllMocks();
  stubMatchMedia(false);
});

/** Presses the mouse on `element`, moves it by (dx, dy) in steps and lets go. */
async function drag(element: HTMLElement, dx: number, dy: number) {
  const box = element.getBoundingClientRect();
  const [x, y] = [box.left + 10, box.top + 5];
  fireEvent.mouseDown(element, { button: 0, clientX: x, clientY: y });
  for (const step of [0.25, 0.5, 0.75, 1]) {
    fireEvent.mouseMove(document, { clientX: x + dx * step, clientY: y + dy * step });
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
  fireEvent.mouseUp(document, { clientX: x + dx, clientY: y + dy });
}

/** dnd-kit swallows clicks for 50 ms after a drop (so the drop does not click the event); a person is slower. */
const afterDrop = () => new Promise((resolve) => setTimeout(resolve, 100));

async function outbox() {
  const db = await localDb(USER);
  return db.outbox.orderBy("seq").toArray();
}

const base = {
  kind: "event",
  container_kind: "calendar",
  deleted_at: null,
  version: 3,
  tzid: me().time_zone,
  color: "blue",
  priority: "medium",
  location: null,
  body: null,
  rrule: null,
};
const timed = (id: string, title: string, calendar: string, date: string, start: string, end: string) => ({
  ...base,
  id,
  title,
  container_id: calendar,
  all_day: false,
  start_date: date,
  start_time: start,
  end_date: date,
  end_time: end,
});

async function open(path: string, standupRule = "FREQ=WEEKLY") {
  const db = await localDb(USER);
  await db.calendars.bulkPut([
    { id: OWN, name: "Work", owner_id: USER, deleted_at: null },
    { id: SHARED, name: "Bob's family", owner_id: "someone-else", deleted_at: null },
  ]);
  await db.shares.put({
    id: "s1",
    container_kind: "calendar",
    container_id: SHARED,
    grantee_id: USER,
    permission: "view",
    revoked_at: null,
  });
  await db.items.bulkPut([
    timed("e1", "Dentist", OWN, "2026-10-14", "11:00", "12:00"),
    { ...timed("e2", "Standup", OWN, "2026-10-05", "09:00", "09:15"), rrule: standupRule },
    timed("e3", "Party", SHARED, "2026-10-14", "18:00", "20:00"),
    timed("e4", "Workshop", OWN, "2026-10-28", "10:00", "12:00"),
  ]);
  // Pushes never answer here, so the outbox keeps what the page wrote.
  stubApi({ "GET /me": () => json(me()), "POST /sync/push": () => new Promise<Response>(() => undefined) });
  renderApp(path);
  await screen.findByRole("heading", { level: 1, name: /^Calendar:/ });
  return { user: userEvent.setup(), db };
}

describe("drag and drop", { timeout: 15_000 }, () => {
  it("month: an event dropped on another day keeps its times; undo moves it back", async () => {
    const { user, db } = await open("/calendar?date=2026-10-14&view=month");
    const dentist = await screen.findByRole("button", { name: "Details of Dentist" });
    await drag(dentist, 200, 0); // Wednesday 14 → Friday 16
    const toast = await screen.findByText("Moved Dentist to Friday, October 16, 2026");
    expect(await outbox()).toMatchObject([
      {
        entity_id: "e1",
        op: "update",
        base_version: 3,
        base: { start_date: "2026-10-14", end_date: "2026-10-14" },
        data: { start_date: "2026-10-16", end_date: "2026-10-16" },
      },
    ]);
    expect(await db.items.get("e1")).toMatchObject({ start_time: "11:00", end_time: "12:00" });
    expect(screen.queryByRole("dialog", { name: "Event details" })).not.toBeInTheDocument(); // no click after a drag

    await user.click(within(toast.closest("li") ?? document.body).getByRole("button", { name: "Undo" }));
    await waitFor(async () => {
      expect(await db.items.get("e1")).toMatchObject({ start_date: "2026-10-14" });
    });
  });

  it("week: the new start comes in 15-minute steps and the length stays", async () => {
    const { db } = await open("/calendar?date=2026-10-28&view=week");
    const workshop = await screen.findByRole("button", { name: "Details of Workshop" });
    // One day to the right and 2 h 40 min (128 px) down: 12:40 → snapped from the block's top.
    await drag(workshop, 100, 128);
    await screen.findByText("Moved Workshop to Thursday, October 29, 2026, 12:45");
    expect(await db.items.get("e4")).toMatchObject({
      start_date: "2026-10-29",
      start_time: "12:45",
      end_date: "2026-10-29",
      end_time: "14:45",
    });
  });

  it("a series asks: only this occurrence becomes a copy, all occurrences move the series", async () => {
    const { db } = await open("/calendar?date=2026-10-14&view=month");
    const standups = await screen.findAllByRole("button", { name: "Details of Standup" });
    await drag(standups[1] as HTMLElement, 100, 0); // Monday 12 → Tuesday 13
    const ask = await screen.findByRole("dialog", { name: "Move repeating event?" });
    await afterDrop();
    await userEvent.click(within(ask).getByRole("button", { name: "Only this occurrence" }));
    await screen.findByText("Moved Standup to Tuesday, October 13, 2026");
    const [copy, exclusion] = await outbox();
    expect(copy).toMatchObject({ op: "create", data: { title: "Standup", start_date: "2026-10-13", rrule: null } });
    expect(exclusion).toMatchObject({ entity_id: "e2", op: "exclude", data: { occurrence_date: "2026-10-12" } });

    const [first] = await screen.findAllByRole("button", { name: "Details of Standup" });
    await drag(first as HTMLElement, 200, 0); // Monday 5 → Wednesday 7, all of them
    await afterDrop();
    await userEvent.click(
      within(await screen.findByRole("dialog", { name: "Move repeating event?" })).getByRole("button", {
        name: "All occurrences",
      }),
    );
    await screen.findByText("Moved Standup to Wednesday, October 7, 2026");
    const series = await db.items.get("e2");
    expect(series).toMatchObject({ start_date: "2026-10-07", rrule: "FREQ=WEEKLY" });
    // Its excluded 12 October moved along to the 14th.
    expect((await outbox()).slice(2).map((entry) => [entry.op, entry.data])).toEqual([
      ["include", { occurrence_date: "2026-10-12" }],
      ["update", { start_date: "2026-10-07", end_date: "2026-10-07" }],
      ["exclude", { occurrence_date: "2026-10-14" }],
    ]);
  });

  it("a click still opens the card; an event shown for viewing only does not move", async () => {
    const { user } = await open("/calendar?date=2026-10-14&view=month");
    const party = await screen.findByRole("button", { name: "Details of Party" });
    await drag(party, 200, 0);
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(await outbox()).toHaveLength(0);
    await user.click(screen.getByRole("button", { name: "Details of Dentist" }));
    expect(await screen.findByRole("dialog", { name: "Event details" })).toBeInTheDocument();
  });

  // +++===+++ 2026-10-29 — Hasan Alizada — HAAL-092. A series on chosen weekdays moves only one occurrence to another day.
  it("a series on chosen weekdays offers only this occurrence for another day", async () => {
    const { db } = await open("/calendar?date=2026-10-14&view=month", "FREQ=WEEKLY;BYDAY=MO,WE");
    const standups = await screen.findAllByRole("button", { name: "Details of Standup" });
    await drag(standups[0] as HTMLElement, 100, 0); // Monday 5 → Tuesday 6
    const ask = await screen.findByRole("dialog", { name: "Move repeating event?" });
    expect(ask).toHaveTextContent("repeats on chosen days, so only the occurrence on Monday, October 5, 2026 can move");
    expect(within(ask).queryByRole("button", { name: "All occurrences" })).not.toBeInTheDocument();
    await afterDrop();
    await userEvent.click(within(ask).getByRole("button", { name: "Only this occurrence" }));
    await screen.findByText("Moved Standup to Tuesday, October 6, 2026");
    expect((await db.items.get("e2"))?.rrule).toBe("FREQ=WEEKLY;BYDAY=MO,WE");
  });
});
