// +++===+++ 2026-10-22 — Hasan Alizada — HAAL-060. Day view (FR-CAL-01, F-14, D-61): one-off and multi-day events,
// series occurrences, deleted events left out, the viewer's zone (a Berlin evening event lands on the next day in
// Baku), continuing and ongoing timed events, the order (all-day, start, title — never colour), and the page itself
// (date from the URL, today by default, rows, empty state, 12-hour setting, live from the local database).
import { screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { entriesOn } from "@/lib/dayView";
import { todayIn } from "@/lib/datetime";
import { localDb } from "@/sync/db";

import { json, me, renderApp, settings, stubApi } from "./fake-api";

const USER = me().id;
const CAL = "0199f000-0000-7000-8000-0000000000c1";
let next = 0;

function event(fields: Record<string, unknown>): Record<string, unknown> {
  next += 1;
  return {
    id: `0199f000-0000-7000-8000-${String(next).padStart(12, "0")}`,
    kind: "event",
    container_kind: "calendar",
    container_id: CAL,
    title: "Event",
    color: "brown",
    all_day: true,
    start_time: null,
    end_time: null,
    tzid: "Europe/Berlin",
    rrule: null,
    location: null,
    deleted_at: null,
    created_at: "2026-10-01T10:00:00Z",
    ...fields,
  };
}

const titles = (rows: Record<string, unknown>[], date: string, tz = "Europe/Berlin") =>
  entriesOn(rows, date, tz).map((e) => e.title);

describe("entries of a day", () => {
  it("one-off, multi-day, series and deleted events", () => {
    const rows = [
      event({ title: "Trip", start_date: "2026-10-21", end_date: "2026-10-23" }),
      event({ title: "Gym", start_date: "2026-10-01", end_date: "2026-10-01", rrule: "FREQ=WEEKLY" }), // Thursdays
      event({ title: "Rent", start_date: "2026-01-31", end_date: "2026-01-31", rrule: "FREQ=MONTHLY" }),
      event({ title: "Gone", start_date: "2026-10-22", end_date: "2026-10-22", deleted_at: "2026-10-20T00:00:00Z" }),
      { id: "note-1", kind: "note", title: "A note" },
    ];
    expect(titles(rows, "2026-10-22")).toEqual(["Gym", "Trip"]);
    expect(titles(rows, "2026-10-31")).toEqual(["Rent"]);
    expect(titles(rows, "2026-11-30")).toEqual([]); // no 31st, nothing moved
  });

  it("the viewer's zone decides the day; continuing and ongoing events", () => {
    const late = event({
      title: "Late call",
      all_day: false,
      start_date: "2026-10-22",
      end_date: "2026-10-22",
      start_time: "23:00",
      end_time: "23:30",
    });
    expect(titles([late], "2026-10-22")).toEqual(["Late call"]);
    const [baku] = entriesOn([late], "2026-10-23", "Asia/Baku"); // UTC+4: 01:00–01:30 the next day
    expect(baku).toMatchObject({ title: "Late call", start: "01:00", end: "01:30", continues: false });
    expect(titles([late], "2026-10-22", "Asia/Baku")).toEqual([]);

    const night = event({
      title: "Night flight",
      all_day: false,
      start_date: "2026-10-22",
      end_date: "2026-10-23",
      start_time: "22:00",
      end_time: "02:00",
    });
    expect(entriesOn([night], "2026-10-22", "Europe/Berlin")[0]).toMatchObject({
      start: "22:00",
      goesOn: true,
      continues: false,
    });
    expect(entriesOn([night], "2026-10-23", "Europe/Berlin")[0]).toMatchObject({
      end: "02:00",
      continues: true,
      goesOn: false,
    });
  });

  it("keeps the wall-clock time of a series across the DST change", () => {
    const meeting = event({
      title: "Team meeting",
      all_day: false,
      start_date: "2026-10-22",
      end_date: "2026-10-22",
      start_time: "09:00",
      end_time: "10:00",
      rrule: "FREQ=WEEKLY",
    });
    expect(entriesOn([meeting], "2026-10-22", "Europe/Berlin")[0]?.start).toBe("09:00");
    expect(entriesOn([meeting], "2026-10-29", "Europe/Berlin")[0]?.start).toBe("09:00"); // after 25 October
    expect(entriesOn([meeting], "2026-10-29", "UTC")[0]?.start).toBe("08:00");
  });

  it("orders all-day first, then by start, then by title — never by colour", () => {
    const day = { start_date: "2026-10-22", end_date: "2026-10-22" };
    const timed = (title: string, start: string, color = "brown") =>
      event({ ...day, title, color, all_day: false, start_time: start, end_time: "23:00" });
    const rows = [
      timed("dentist", "09:00", "blue"),
      timed("Call", "08:30", "red"),
      event({ ...day, title: "Birthday", color: "yellow" }),
      timed("Apple", "09:00", "black"),
      event({
        title: "Flight",
        all_day: false,
        start_date: "2026-10-21",
        end_date: "2026-10-22",
        start_time: "22:00",
        end_time: "02:00",
      }),
    ];
    expect(titles(rows, "2026-10-22")).toEqual(["Birthday", "Flight", "Call", "Apple", "dentist"]);
  });

  it("leaves out a rule this version cannot expand", () => {
    const rows = [
      event({ title: "Future rule", start_date: "2026-10-22", end_date: "2026-10-22", rrule: "FREQ=WEEKLY;BYDAY=MO" }),
    ];
    expect(titles(rows, "2026-10-22")).toEqual([]);
  });
});

async function seed(rows: Record<string, unknown>[]): Promise<void> {
  const db = await localDb(USER);
  await db.items.bulkPut(rows);
}

// Page tests: events in the viewer's own zone (the profile zone of the test user), so times show as written.
const VIEWER = me().time_zone;

describe("day view page", () => {
  it("shows the date from the URL with its events in order", async () => {
    await seed([
      event({
        title: "Dentist",
        tzid: VIEWER,
        all_day: false,
        start_date: "2026-10-22",
        end_date: "2026-10-22",
        start_time: "09:00",
        end_time: "09:30",
        location: "Main street 1",
      }),
      event({ title: "Birthday", tzid: VIEWER, start_date: "2026-10-22", end_date: "2026-10-22" }),
      event({ title: "Gym", tzid: VIEWER, start_date: "2026-10-01", end_date: "2026-10-01", rrule: "FREQ=WEEKLY" }),
    ]);
    stubApi({ "GET /me": () => json(me()) });
    renderApp("/calendar?date=2026-10-22");
    const list = await screen.findByRole("list", { name: "Events on Thursday, October 22, 2026" });
    const rows = within(list).getAllByRole("listitem");
    expect(rows.map((row) => row.textContent)).toEqual([
      "All dayBirthday",
      "All dayGymrepeats", // "repeats" is the row's screen-reader description (D-72)
      "09:00–09:30DentistMain street 1",
    ]);
    expect(within(rows[1] as HTMLElement).getByRole("button")).toHaveAccessibleDescription("repeats");
    expect(within(rows[1] as HTMLElement).getByTitle("Repeats")).toBeInTheDocument();
    expect(rows[2]).toHaveClass("ev-brown", "ev-tint", "ev-bar"); // the colour of the event (default brown)
  });

  it("follows the 12-hour setting", async () => {
    await seed([
      event({
        title: "Dentist",
        tzid: VIEWER,
        color: "blue",
        all_day: false,
        start_date: "2026-10-22",
        end_date: "2026-10-22",
        start_time: "14:00",
        end_time: "14:30",
      }),
    ]);
    stubApi({ "GET /me": () => json(me()), "GET /me/settings": () => json(settings({ time_format: "12h" })) });
    renderApp("/calendar?date=2026-10-22");
    expect(await screen.findByText(/^2:00\sPM–2:30\sPM$/)).toBeInTheDocument(); // ICU may use a narrow space
  });

  it("opens today by default, shows an empty day and updates when an event arrives", async () => {
    stubApi({ "GET /me": () => json(me()) });
    renderApp("/calendar?date=not-a-date");
    expect(await screen.findByText("Nothing planned for this day")).toBeInTheDocument();
    await screen.findByRole("button", { name: /Account menu/ }); // the profile is loaded, sync has started
    const today = todayIn(VIEWER);
    const { localChanged } = await import("@/sync");
    await seed([event({ title: "Arrived", tzid: VIEWER, start_date: today, end_date: today })]);
    localChanged(USER);
    await waitFor(() => {
      expect(screen.getByText("Arrived")).toBeInTheDocument();
    });
  });
});
