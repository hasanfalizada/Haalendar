// +++===+++ 2026-10-28 — Hasan Alizada — HAAL-087. Week view (FR-CAL-25, D-75): the Day / Week switch and the keys D / W
// (the view in the URL and remembered on this device), 7 day lists from the week start, all-day events on top, timed
// events by time with overlapping ones side by side, ‹ › by a week, the range as the title without the Day Number, the
// current-time line only in today's column, an event opens the details card.
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { todayIn } from "@/lib/datetime";
import { localDb } from "@/sync/db";

import { json, me, renderApp, stubApi } from "./fake-api";

const USER = me().id;
const OWN = "0199f000-0000-7000-8000-0000000000c1";
const DAY = "2026-10-28"; // a Wednesday; the week runs Monday 26 October – Sunday 1 November

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

async function open(path: string) {
  const db = await localDb(USER);
  await db.calendars.put({ id: OWN, name: "Work", owner_id: USER, deleted_at: null });
  await db.items.bulkPut([
    timed("e1", "Workshop", "2026-10-28", "10:00", "12:00"),
    timed("e2", "Call bank", "2026-10-28", "10:30", "11:00"),
    timed("e3", "Dentist", "2026-10-27", "11:00", "12:00"),
    { ...timed("e4", "Standup", "2026-10-26", "09:00", "09:15"), rrule: "FREQ=DAILY" },
    {
      ...base,
      id: "e5",
      title: "Conference",
      all_day: true,
      start_date: "2026-10-29",
      end_date: "2026-10-30",
      start_time: null,
      end_time: null,
    },
    timed("e6", "Next week", "2026-11-03", "10:00", "11:00"),
  ]);
  stubApi({ "GET /me": () => json(me()) });
  const { router } = renderApp(path);
  await screen.findByRole("heading", { level: 1, name: /^Calendar:/ });
  return { router, user: userEvent.setup() };
}

const dayList = (name: string) => screen.getByRole("list", { name });

describe("week view", { timeout: 15_000 }, () => {
  it("switches from the day view, keeps the view in the URL and remembers it on this device", async () => {
    const { router, user } = await open(`/calendar?date=${DAY}`);
    const views = screen.getByRole("radiogroup", { name: "View" });
    expect(within(views).getByRole("radio", { name: "Day" })).toBeChecked();
    await user.click(within(views).getByRole("radio", { name: "Week" }));

    const heading = await screen.findByRole("heading", { level: 1, name: /October 26.*November 1, 2026/ });
    expect(heading).toBeInTheDocument();
    expect(router.state.location.search).toMatchObject({ date: DAY, view: "week" });
    expect(screen.queryByTitle(/^Day \d+ of/)).not.toBeInTheDocument(); // no Day Number for a week
    expect(screen.getByText("Week 44")).toBeInTheDocument();
    expect(window.localStorage.getItem("haalendar.calendar.view")).toBe("week");

    await user.keyboard("d");
    await screen.findByRole("heading", { level: 1, name: /Today|October 28, 2026/ });
    expect(router.state.location.search).toMatchObject({ view: "day" });
    await user.keyboard("w");
    await screen.findByRole("heading", { level: 1, name: /October 26.*November 1, 2026/ });
  });

  it("lists the week's events per day: all-day on top, timed by time, overlapping side by side", async () => {
    await open(`/calendar?date=${DAY}&view=week`);
    const wednesday = await screen.findByRole("list", { name: "Wednesday, October 28, 2026" });
    const workshop = await within(wednesday).findByRole("button", { name: "Details of Workshop" }); // after the local rows load
    const call = within(wednesday).getByRole("button", { name: "Details of Call bank" });
    expect(workshop).toHaveAccessibleDescription("10:00–12:00");
    expect(workshop.closest("li")).toHaveStyle({ top: "480px", height: "96px", left: "0%", width: "50%" });
    expect(call.closest("li")).toHaveStyle({ top: "504px", left: "50%", width: "50%" });

    expect(
      within(dayList("Tuesday, October 27, 2026")).getByRole("button", { name: "Details of Dentist" }),
    ).toBeInTheDocument();
    // The daily series on every day of the week; a 15-minute event is drawn 30 minutes high.
    expect(screen.getAllByRole("button", { name: "Details of Standup" })).toHaveLength(7);
    expect(
      within(dayList("Monday, October 26, 2026")).getByRole("button", { name: "Details of Standup" }).closest("li"),
    ).toHaveStyle({ top: "432px", height: "24px" });
    // A two-day all-day event shows on both days in the all-day row.
    expect(
      within(dayList("All day, Thursday, October 29, 2026")).getByRole("button", { name: "Details of Conference" }),
    ).toHaveAccessibleDescription("All day");
    expect(
      within(dayList("All day, Friday, October 30, 2026")).getByRole("button", { name: "Details of Conference" }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Details of Next week" })).not.toBeInTheDocument();
  });

  it("moves by a week with the buttons and the arrow keys; an event opens its details", async () => {
    const { router, user } = await open(`/calendar?date=${DAY}&view=week`);
    await user.click(await screen.findByRole("button", { name: "Next week" }));
    await screen.findByRole("heading", { level: 1, name: /November 2.*8, 2026/ });
    expect(router.state.location.search).toMatchObject({ date: "2026-11-04", view: "week" });
    await user.click(await screen.findByRole("button", { name: "Details of Next week" }));
    const card = await screen.findByRole("dialog", { name: "Event details" });
    expect(within(card).getByRole("heading", { name: "Next week" })).toBeInTheDocument();
    await user.keyboard("{Escape}");
    await waitFor(() => {
      expect(screen.queryByRole("dialog", { name: "Event details" })).not.toBeInTheDocument();
    });
    await user.keyboard("{ArrowLeft}");
    await screen.findByRole("heading", { level: 1, name: /October 26.*November 1, 2026/ });
  });

  it("draws the current-time line only in today's column", async () => {
    const today = todayIn(me().time_zone);
    await open(`/calendar?date=${today}&view=week`);
    const lines = await screen.findAllByTestId("now-line");
    expect(lines).toHaveLength(1);
    expect(screen.getByRole("button", { name: "Today" })).toBeDisabled();
  });
});
