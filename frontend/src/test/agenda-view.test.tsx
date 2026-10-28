// +++===+++ 2026-10-28 — Hasan Alizada — HAAL-089. Agenda (FR-CAL-27, D-77): the switch and the key A, the days with
// events from the selected date for the user's range (default 30), "Today" / "Tomorrow" headings, rows like the day
// list (time, title, flags), a heading opens the day view, a row its details card, ‹ › move by the range, an empty
// range says so; a long range renders in batches.
import { act, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { addDays, todayIn } from "@/lib/datetime";
import { localDb } from "@/sync/db";

import { json, me, renderApp, settings, stubApi } from "./fake-api";

const USER = me().id;
const OWN = "0199f000-0000-7000-8000-0000000000c1";
const TODAY = todayIn(me().time_zone);

const base = {
  kind: "event",
  container_kind: "calendar",
  container_id: OWN,
  deleted_at: null,
  version: 1,
  tzid: me().time_zone,
  color: "blue",
  priority: "medium",
  location: null,
  body: null,
  rrule: null,
};
const timed = (id: string, title: string, date: string, start: string, end: string) => ({
  ...base,
  id,
  title,
  all_day: false,
  start_date: date,
  start_time: start,
  end_date: date,
  end_time: end,
});

async function open(path: string, agendaDays = 30) {
  const db = await localDb(USER);
  await db.calendars.put({ id: OWN, name: "Work", owner_id: USER, deleted_at: null });
  await db.items.bulkPut([
    timed("e1", "Breakfast", TODAY, "07:00", "07:30"), // early today: still shown
    { ...timed("e2", "Standup", TODAY, "09:00", "09:15"), rrule: "FREQ=MONTHLY" },
    timed("e3", "Dentist", addDays(TODAY, 1), "11:00", "12:00"),
    { ...timed("e4", "Notes", addDays(TODAY, 3), "10:00", "11:00"), body: "Bring the **card**" },
    timed("e5", "Far away", addDays(TODAY, 40), "10:00", "11:00"),
  ]);
  stubApi({
    "GET /me": () => json(me()),
    "GET /me/settings": () => json(settings({ agenda_days: agendaDays })),
  });
  const { router } = renderApp(path);
  await screen.findByRole("heading", { level: 1, name: /^Calendar:/ });
  return { router, user: userEvent.setup() };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("agenda", { timeout: 15_000 }, () => {
  it("lists the days with events from today for the user's range, today whole", async () => {
    const { router, user } = await open(`/calendar?date=${TODAY}`);
    await user.click(screen.getByRole("radio", { name: "Agenda" }));
    await waitFor(() => {
      expect(router.state.location.search).toMatchObject({ view: "agenda" });
    });
    const todayList = await screen.findByRole("list", { name: new RegExp(`^${dayName(TODAY)}$`) });
    await waitFor(() => {
      expect(
        within(todayList)
          .getAllByRole("button")
          .map((b) => b.getAttribute("aria-label")),
      ).toEqual(["Details of Breakfast", "Details of Standup"]);
    });
    expect(screen.getByRole("heading", { level: 2, name: `Today ${dayName(TODAY)}` })).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { level: 2, name: `Tomorrow ${dayName(addDays(TODAY, 1))}` }),
    ).toBeInTheDocument();
    // Rows read like the day list: time, title, flags as the description.
    expect(screen.getByRole("button", { name: "Details of Standup" })).toHaveAccessibleDescription("repeats");
    expect(screen.getByRole("button", { name: "Details of Notes" })).toHaveAccessibleDescription("has a description");
    expect(screen.getByRole("button", { name: "Details of Dentist" })).toHaveTextContent("11:00–12:00Dentist");
    // 30 days: the event 40 days ahead is not in the range; days without events are left out.
    expect(screen.queryByRole("button", { name: "Details of Far away" })).not.toBeInTheDocument();
    expect(screen.getAllByRole("heading", { level: 2 })).toHaveLength(3); // today, tomorrow, in three days
    expect(screen.queryByTitle(/^Day \d+ of/)).not.toBeInTheDocument();
  });

  it("a heading opens the day, a row its card; the arrows move by the range", async () => {
    const { router, user } = await open(`/calendar?date=${TODAY}&view=agenda`, 7);
    await user.click(await screen.findByRole("button", { name: "Details of Dentist" }));
    expect(await screen.findByRole("dialog", { name: "Event details" })).toBeInTheDocument();
    await user.keyboard("{Escape}");
    await waitFor(() => {
      expect(screen.queryByRole("dialog", { name: "Event details" })).not.toBeInTheDocument();
    });

    await user.click(screen.getByRole("button", { name: dayName(addDays(TODAY, 3)) }));
    await waitFor(() => {
      expect(router.state.location.search).toMatchObject({ date: addDays(TODAY, 3), view: "day" });
    });
    await user.keyboard("a");
    await screen.findByRole("button", { name: "Details of Notes" });
    await user.click(screen.getByRole("button", { name: "Next days" }));
    await waitFor(() => {
      expect(router.state.location.search).toMatchObject({ date: addDays(TODAY, 10), view: "agenda" });
    });
    expect(await screen.findByRole("heading", { level: 2, name: "Nothing in these 7 days" })).toBeInTheDocument();
  });
});

describe("agenda of a long range", { timeout: 15_000 }, () => {
  it("renders the days in batches of 31 as the end of the list comes near", async () => {
    let reachEnd: (() => void) | null = null;
    vi.stubGlobal(
      "IntersectionObserver",
      class {
        constructor(callback: (entries: { isIntersecting: boolean }[]) => void) {
          reachEnd = () => {
            callback([{ isIntersecting: true }]);
          };
        }
        observe(): void {}
        disconnect(): void {}
      },
    );
    const db = await localDb(USER);
    await db.calendars.put({ id: OWN, name: "Work", owner_id: USER, deleted_at: null });
    await db.items.put({ ...timed("d1", "Daily walk", TODAY, "07:00", "07:30"), rrule: "FREQ=DAILY" });
    stubApi({
      "GET /me": () => json(me()),
      "GET /me/settings": () => json(settings({ agenda_days: 365 })),
    });
    renderApp(`/calendar?date=${TODAY}&view=agenda`);
    await waitFor(() => {
      expect(screen.getAllByRole("heading", { level: 2 })).toHaveLength(31);
    });
    act(() => {
      reachEnd?.();
    });
    expect(screen.getAllByRole("heading", { level: 2 })).toHaveLength(62);
  });
});

function dayName(date: string): string {
  return new Intl.DateTimeFormat("en", { dateStyle: "full", timeZone: "UTC" }).format(Date.parse(`${date}T00:00:00Z`));
}
