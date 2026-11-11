// +++===+++ 2026-10-25 — Hasan Alizada — HAAL-068. Overdue counter (FR-CAL-17, F-32, D-68): the legacy rule (one-off
// events starting before today, series whose effective start is before today), the viewer's day for timed events,
// deleted rows left out; shown under the mini month (desktop sidebar, phone date sheet), hidden at zero, moving on at
// midnight by itself.
import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { OverdueCounter } from "@/components/calendar/OverdueCounter";
import { addDays, todayIn } from "@/lib/datetime";
import { overdueCount } from "@/lib/overdue";
import { localDb } from "@/sync/db";

import { json, me, renderApp, stubApi } from "./fake-api";
import { stubMatchMedia } from "./setup";

const TODAY = "2026-11-10";

function event(id: string, fields: Record<string, unknown>): Record<string, unknown> {
  return { id, kind: "event", all_day: true, rrule: null, deleted_at: null, tzid: "Europe/Berlin", ...fields };
}

afterEach(() => {
  vi.useRealTimers();
  stubMatchMedia(false);
});

describe("the legacy rule", () => {
  it("counts one-off events that started before today and series that began before today", () => {
    const rows = [
      event("yesterday", { start_date: "2026-11-09", end_date: "2026-11-09" }),
      event("today", { start_date: TODAY, end_date: TODAY }),
      event("tomorrow", { start_date: "2026-11-11", end_date: "2026-11-11" }),
      event("multi-day, still running", { start_date: "2026-11-08", end_date: "2026-11-12" }),
      event("deleted", { start_date: "2026-11-01", end_date: "2026-11-01", deleted_at: "2026-11-02T00:00:00Z" }),
      event("series begun", { start_date: "2026-11-01", end_date: "2026-11-01", rrule: "FREQ=WEEKLY" }),
      event("series from today", { start_date: TODAY, end_date: TODAY, rrule: "FREQ=DAILY" }),
      { id: "note", kind: "note", start_date: "2026-11-01" },
    ];
    // yesterday, the running multi-day event and the begun series
    expect(overdueCount(rows, TODAY, "Europe/Berlin")).toBe(3);
    expect(overdueCount([], TODAY, "Europe/Berlin")).toBe(0);
  });

  it("uses the effective start of a series", () => {
    const series = (exceptions: string[]) =>
      event("s", { start_date: "2026-11-08", end_date: "2026-11-08", rrule: "FREQ=DAILY", exceptions });
    expect(overdueCount([series(["2026-11-08"])], TODAY, "UTC")).toBe(1); // starts on the 9th
    expect(overdueCount([series(["2026-11-08", "2026-11-09"])], TODAY, "UTC")).toBe(0); // starts today
  });

  it("places a timed event on the viewer's day", () => {
    // 22:00 in Berlin on the 9th is 01:00 on the 10th in Baku.
    const late = event("late", {
      all_day: false,
      start_date: "2026-11-09",
      end_date: "2026-11-09",
      start_time: "22:00",
      end_time: "23:00",
    });
    expect(overdueCount([late], TODAY, "Europe/Berlin")).toBe(1);
    expect(overdueCount([late], TODAY, "Asia/Baku")).toBe(0);
  });
});

describe("the counter", () => {
  it("moves on at midnight by itself and hides at zero", () => {
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval", "Date"] });
    vi.setSystemTime(new Date("2026-11-10T22:59:30Z")); // 23:59:30 in Berlin
    const rows = [event("today", { start_date: TODAY, end_date: TODAY })];
    render(<OverdueCounter rows={rows} viewerTz="Europe/Berlin" />);
    expect(screen.queryByText(/overdue/)).not.toBeInTheDocument();
    act(() => {
      vi.advanceTimersByTime(60_000);
    });
    expect(screen.getByText("1 overdue event")).toBeInTheDocument();
  });
});

describe("in the calendar", { timeout: 15_000 }, () => {
  async function seed(): Promise<void> {
    const today = todayIn(me().time_zone);
    const db = await localDb(me().id);
    await db.items.bulkPut([
      event("0199f000-0000-7000-8000-0000000000e1", {
        start_date: addDays(today, -3),
        end_date: addDays(today, -3),
        title: "Old",
      }),
      event("0199f000-0000-7000-8000-0000000000e2", {
        start_date: addDays(today, -1),
        end_date: addDays(today, -1),
        title: "Yesterday",
      }),
      event("0199f000-0000-7000-8000-0000000000e3", {
        start_date: addDays(today, 2),
        end_date: addDays(today, 2),
        title: "Later",
      }),
    ]);
    stubApi({ "GET /me": () => json(me()) });
  }

  it("desktop: under the mini month in the sidebar", async () => {
    vi.stubGlobal(
      "matchMedia",
      vi.fn((query: string) => ({
        matches: /min-width/.test(query),
        media: query,
        onchange: null,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        addListener: vi.fn(),
        removeListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    );
    await seed();
    renderApp("/calendar");
    const sidebar = await screen.findByRole("complementary", { name: "Calendar sidebar" });
    expect(await within(sidebar).findByText("2 overdue events")).toBeInTheDocument();
  });

  it("phone: in the date sheet", async () => {
    await seed();
    renderApp("/calendar");
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: /choose another date$/ }));
    const sheet = await screen.findByRole("dialog");
    expect(await within(sheet).findByText("2 overdue events")).toBeInTheDocument();
  });
});
