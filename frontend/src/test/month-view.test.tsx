// +++===+++ 2026-10-28 — Hasan Alizada — HAAL-088. Month view (FR-CAL-26, D-76): the switch and the key M, the weeks of
// the month from the week start, events per day in the day list's order ("09:00 Standup"), "+N more" when they do not
// fit, a day (number, "+N more") opens its day view, an event opens its card, ‹ › / arrows move by a month keeping
// the day of month (the last day when shorter), phones: one button per day with colour bars.
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { localDb } from "@/sync/db";

import { json, me, renderApp, stubApi } from "./fake-api";
import { stubMatchMedia } from "./setup";

const USER = me().id;
const OWN = "0199f000-0000-7000-8000-0000000000c1";

afterEach(() => {
  stubMatchMedia(false);
});

function screenWidth(width: number): void {
  vi.stubGlobal(
    "matchMedia",
    vi.fn((query: string) => {
      const min = /min-width:\s*(\d+)px/.exec(query);
      return {
        matches: min ? width >= Number(min[1]) : false,
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
}

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
const timed = (id: string, title: string, date: string, start: string) => ({
  ...base,
  id,
  title,
  all_day: false,
  start_date: date,
  start_time: start,
  end_date: date,
  end_time: "23:00",
});
const allDay = (id: string, title: string, start: string, end: string) => ({
  ...base,
  id,
  title,
  all_day: true,
  start_date: start,
  end_date: end,
  start_time: null,
  end_time: null,
});

async function open(path: string) {
  const db = await localDb(USER);
  await db.calendars.put({ id: OWN, name: "Work", owner_id: USER, deleted_at: null });
  await db.items.bulkPut([
    timed("e1", "Dentist", "2026-10-14", "11:30"),
    allDay("e2", "Pay rent", "2026-10-14", "2026-10-14"),
    timed("e3", "Standup", "2026-10-14", "09:00"),
    timed("e4", "Review", "2026-10-14", "15:00"),
    timed("e5", "Gym", "2026-10-14", "18:00"),
    allDay("e6", "Trip", "2026-10-30", "2026-11-02"),
  ]);
  stubApi({ "GET /me": () => json(me()) });
  const { router } = renderApp(path);
  await screen.findByRole("heading", { level: 1, name: /^Calendar:/ });
  return { router, user: userEvent.setup() };
}

describe("month view", { timeout: 15_000 }, () => {
  it("shows the weeks of the month with each day's events and +N more", async () => {
    screenWidth(1280);
    await open("/calendar?date=2026-10-14&view=month");
    expect(screen.getByRole("heading", { level: 1, name: /^Calendar:\s*October 2026$/ })).toBeInTheDocument();
    expect(screen.queryByTitle(/^Day \d+ of/)).not.toBeInTheDocument();
    // Five weeks: Monday 28 September … Sunday 1 November.
    expect(screen.getByRole("button", { name: "Open Monday, September 28, 2026" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Open Sunday, November 1, 2026" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Open Monday, November 2, 2026" })).not.toBeInTheDocument();

    // Five events, room for three lines (unmeasured): two shown in the day order, "+3 more".
    const day = await screen.findByRole("list", { name: "Wednesday, October 14, 2026" });
    await waitFor(() => {
      expect(
        within(day)
          .getAllByRole("button")
          .map((b) => b.getAttribute("aria-label")),
      ).toEqual(["Details of Pay rent", "Details of Standup"]);
    });
    expect(within(day).getByRole("button", { name: "Details of Standup" })).toHaveTextContent("09:00Standup");
    expect(screen.getByRole("button", { name: "3 more on Wednesday, October 14, 2026" })).toHaveTextContent("+3 more");
    // A trip over several days shows on each of them, the neighbouring month's days included.
    expect(
      within(screen.getByRole("list", { name: "Sunday, November 1, 2026" })).getByRole("button", {
        name: "Details of Trip",
      }),
    ).toBeInTheDocument();
  });

  it("opens a day from its number and from +N more; an event opens its card", async () => {
    screenWidth(1280);
    const { router, user } = await open("/calendar?date=2026-10-14&view=month");
    await user.click(await screen.findByRole("button", { name: "Details of Standup" }));
    expect(await screen.findByRole("dialog", { name: "Event details" })).toBeInTheDocument();
    await user.keyboard("{Escape}");
    await waitFor(() => {
      expect(screen.queryByRole("dialog", { name: "Event details" })).not.toBeInTheDocument();
    });

    await user.click(screen.getByRole("button", { name: "3 more on Wednesday, October 14, 2026" }));
    await waitFor(() => {
      expect(router.state.location.search).toMatchObject({ date: "2026-10-14", view: "day" });
    });
    expect(await screen.findByRole("button", { name: "Details of Gym" })).toBeInTheDocument();
    await user.keyboard("m");
    await user.click(await screen.findByRole("button", { name: "Open Friday, October 30, 2026" }));
    await waitFor(() => {
      expect(router.state.location.search).toMatchObject({ date: "2026-10-30", view: "day" });
    });
  });

  it("moves by a month keeping the day, or the month's last day", async () => {
    const { router, user } = await open("/calendar?date=2026-10-31&view=month");
    await user.click(screen.getByRole("button", { name: "Next month" }));
    await screen.findByRole("heading", { level: 1, name: "Calendar: November 2026" });
    expect(router.state.location.search).toMatchObject({ date: "2026-11-30", view: "month" });
    await user.keyboard("{ArrowLeft}");
    await screen.findByRole("heading", { level: 1, name: "Calendar: October 2026" });
    expect(router.state.location.search).toMatchObject({ date: "2026-10-30" });
    await user.click(screen.getByRole("radio", { name: "Week" }));
    await screen.findByRole("heading", { level: 1, name: /October 26.*November 1, 2026/ });
  });

  it("phones: a day is one button with its event count that opens the day", async () => {
    const { router, user } = await open("/calendar?date=2026-10-14&view=month");
    const day = await screen.findByRole("button", { name: "Open Wednesday, October 14, 2026, 5 events" });
    expect(day).toHaveTextContent("14+2");
    await user.click(day);
    await waitFor(() => {
      expect(router.state.location.search).toMatchObject({ date: "2026-10-14", view: "day" });
    });
  });

  it("desktop: an event opens its card in a popover", async () => {
    screenWidth(1280);
    const { user } = await open("/calendar?date=2026-10-14&view=month");
    const standup = await screen.findByRole("button", { name: "Details of Standup" });
    await user.click(standup);
    expect(standup).toHaveAttribute("aria-expanded", "true");
    expect(await screen.findByRole("dialog", { name: "Event details" })).toBeInTheDocument();
  });
});
