// +++===+++ 2026-11-25 11:40 +04 — Hasan Alizada — HAAL-195. The day view as hours and the folding all-day row (D-124):
// List | Hours in the day's header saves the setting `day_layout`; the hours are the week's grid for the one day with the
// current-time line today; the all-day row shows 3 entries a day and "+N more" (all 4 when there are 4), opens for every
// day and closes again, remembered on the device.
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";

import { todayIn } from "@/lib/datetime";
import { localDb } from "@/sync/db";

import { json, me, renderApp, settings, stubApi } from "./fake-api";

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
const allDay = (id: string, title: string, date: string) => ({
  ...base,
  id,
  title,
  all_day: true,
  start_date: date,
  end_date: date,
  start_time: null,
  end_time: null,
});
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

async function open(path: string, routes: Parameters<typeof stubApi>[0] = {}, layout: "list" | "hours" = "list") {
  const db = await localDb(USER);
  await db.calendars.put({ id: OWN, name: "Work", owner_id: USER, deleted_at: null });
  await db.items.bulkPut([
    // Wednesday: six all-day events, three of them folded; Thursday: four, all shown.
    ...["A1", "A2", "A3", "A4", "A5", "A6"].map((title) => allDay(`w-${title}`, title, DAY)),
    ...["B1", "B2", "B3", "B4"].map((title) => allDay(`t-${title}`, title, "2026-10-29")),
    timed("e1", "Workshop", DAY, "10:00", "12:00"),
  ]);
  stubApi({
    "GET /me": () => json(me()),
    "GET /me/settings": () => json(settings({ day_layout: layout })),
    ...routes,
  });
  const { router } = renderApp(path);
  await screen.findByRole("heading", { level: 1, name: /^Calendar:/ });
  return { router, user: userEvent.setup() };
}

const titles = (list: HTMLElement) =>
  within(list)
    .queryAllByRole("button", { name: /^Details of / })
    .map((button) => button.getAttribute("aria-label")?.replace(/^Details of /, ""));

describe("all-day row and the day on the hours", { timeout: 15_000 }, () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("folds a week's all-day events past three, opens them for every day and closes them again", async () => {
    const { user } = await open(`/calendar?date=${DAY}&view=week`);
    const wednesday = await screen.findByRole("list", { name: "All day, Wednesday, October 28, 2026" });
    const thursday = screen.getByRole("list", { name: "All day, Thursday, October 29, 2026" });
    await waitFor(() => {
      expect(titles(wednesday)).toEqual(["A1", "A2", "A3"]);
    });
    expect(
      within(wednesday).getByRole("button", { name: "Show 3 more all-day on Wednesday, October 28, 2026" }),
    ).toHaveTextContent("+3 more");
    // Four are all shown: "+1 more" would take the room of the one it hides.
    expect(titles(thursday)).toEqual(["B1", "B2", "B3", "B4"]);
    expect(within(thursday).queryByRole("button", { name: /more all-day/ })).not.toBeInTheDocument();

    const toggle = screen.getByRole("button", { name: "Show all all-day events" });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    await user.click(within(wednesday).getByRole("button", { name: /^Show 3 more/ }));
    expect(titles(wednesday)).toEqual(["A1", "A2", "A3", "A4", "A5", "A6"]);
    const close = screen.getByRole("button", { name: "Show fewer all-day events" });
    expect(close).toHaveAttribute("aria-expanded", "true");
    expect(window.localStorage.getItem("haalendar.calendar.allDay")).toBe("open");

    await user.click(close);
    expect(titles(wednesday)).toEqual(["A1", "A2", "A3"]);
    expect(window.localStorage.getItem("haalendar.calendar.allDay")).toBe("closed");
  });

  it("shows the day on the hours and saves List | Hours", async () => {
    let saved: unknown = null;
    const { user } = await open(`/calendar?date=${DAY}`, {
      "PATCH /me/settings": (call) => {
        saved = call.body;
        return json(settings({ day_layout: "hours", version: 2 }));
      },
    });
    const layout = screen.getByRole("radiogroup", { name: "Day as" });
    expect(within(layout).getByRole("radio", { name: "List" })).toHaveAttribute("aria-checked", "true");
    expect(screen.queryByRole("list", { name: /^All day,/ })).not.toBeInTheDocument();

    await user.click(within(layout).getByRole("radio", { name: "Hours" }));
    await waitFor(() => {
      expect(saved).toEqual({ day_layout: "hours" });
    });
    expect(within(layout).getByRole("radio", { name: "Hours" })).toHaveAttribute("aria-checked", "true");
    // One day's all-day row (folded as in the week) and its hours with the timed event.
    const row = await screen.findByRole("list", { name: "All day, Wednesday, October 28, 2026" });
    expect(titles(row)).toEqual(["A1", "A2", "A3"]);
    const hours = screen.getByRole("list", { name: "Wednesday, October 28, 2026" });
    expect(titles(hours)).toEqual(["Workshop"]);
    expect(screen.queryByRole("list", { name: /Thursday/ })).not.toBeInTheDocument();
    // The week's switch has no such choice.
    await user.click(screen.getByRole("radio", { name: "Week" }));
    await screen.findByRole("list", { name: "All day, Thursday, October 29, 2026" });
    expect(screen.queryByRole("radiogroup", { name: "Day as" })).not.toBeInTheDocument();
  });

  it("draws the current-time line on today's hours", async () => {
    const today = todayIn(me().time_zone);
    await open(`/calendar?date=${today}`, {}, "hours");
    expect(await screen.findByTestId("now-line")).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "Hours" })).toHaveAttribute("aria-checked", "true");
  });
});
