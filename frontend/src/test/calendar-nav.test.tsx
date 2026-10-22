// +++===+++ 2026-10-22 — Hasan Alizada — HAAL-061. Calendar navigation (FR-CAL-02..04, F-01..F-04, D-62): the month
// grid (six weeks from the user's week start, month and year boundaries), ‹ Today › and the keys ← / → / T, the mini
// month (click, dots for days with events, ARIA grid keyboard that does not move the day by itself), the sidebar on
// desktops (collapsible, remembered), on tablets (overlay) and the date sheet on phones.
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { addMonths, monthGrid, sameDayIn } from "@/lib/monthGrid";
import { localDb } from "@/sync/db";

import { json, me, renderApp, settings, stubApi } from "./fake-api";
import { stubMatchMedia } from "./setup";

const USER = me().id;

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

afterEach(() => {
  stubMatchMedia(false);
});

async function open(path: string, extra: Parameters<typeof stubApi>[0] = {}) {
  stubApi({ "GET /me": () => json(me()), ...extra });
  const { router } = renderApp(path);
  await screen.findByRole("button", { name: /Account menu/ });
  return { router, user: userEvent.setup() };
}

const selectedDate = (router: { state: { location: { search: unknown } } }) =>
  (router.state.location.search as { date?: string }).date;

describe("month grid", () => {
  it("six weeks from the week start, across month and year ends", () => {
    const monday = monthGrid("2026-10", 1);
    expect(monday).toHaveLength(42);
    expect([monday[0], monday[41]]).toEqual(["2026-09-28", "2026-11-08"]);
    expect(monthGrid("2026-10", 0)[0]).toBe("2026-09-27"); // Sunday start
    expect(monthGrid("2026-02", 1)[0]).toBe("2026-01-26");
    expect([addMonths("2026-12", 1), addMonths("2026-01", -1)]).toEqual(["2027-01", "2025-12"]);
    expect([sameDayIn("2026-01-31", "2026-02"), sameDayIn("2028-03-31", "2028-02")]).toEqual([
      "2026-02-28",
      "2028-02-29",
    ]);
  });
});

describe("desktop", () => {
  it("day buttons, keys and the mini month change the date", async () => {
    screenWidth(1280);
    await localDb(USER).then((db) =>
      db.items.put({
        id: "e1",
        kind: "event",
        title: "Dentist",
        color: "blue",
        all_day: true,
        start_date: "2026-10-23",
        end_date: "2026-10-23",
        start_time: null,
        end_time: null,
        tzid: me().time_zone,
        rrule: null,
        deleted_at: null,
      }),
    );
    const { router, user } = await open("/calendar?date=2026-10-22");
    const sidebar = await screen.findByRole("complementary", { name: "Calendar sidebar" });
    const grid = within(sidebar).getByRole("grid", { name: "October 2026" });
    expect(
      await within(grid).findByRole("button", { name: "Friday, October 23, 2026, has events" }),
    ).toBeInTheDocument();
    expect(within(grid).getByRole("gridcell", { selected: true })).toHaveTextContent("22");

    await user.click(screen.getByRole("button", { name: "Next day" }));
    await waitFor(() => {
      expect(selectedDate(router)).toBe("2026-10-23");
    });
    await user.click(screen.getByRole("button", { name: "Previous day" }));
    await waitFor(() => {
      expect(selectedDate(router)).toBe("2026-10-22");
    });

    await user.keyboard("{ArrowRight}{ArrowRight}");
    await waitFor(() => {
      expect(selectedDate(router)).toBe("2026-10-24");
    });
    await user.keyboard("t");
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Today" })).toBeDisabled();
    });

    await user.click(within(grid).getByRole("button", { name: /Saturday, October 31, 2026/ }));
    await waitFor(() => {
      expect(selectedDate(router)).toBe("2026-10-31");
    });
    // Next day into November: the mini month follows.
    await user.click(screen.getByRole("button", { name: "Next day" }));
    expect(await within(sidebar).findByRole("grid", { name: "November 2026" })).toBeInTheDocument();
  });

  it("the grid keyboard moves the focus, Enter selects, and the page keys stay quiet meanwhile", async () => {
    screenWidth(1280);
    const { router, user } = await open("/calendar?date=2026-10-22");
    const sidebar = await screen.findByRole("complementary", { name: "Calendar sidebar" });
    const selected = within(sidebar).getByRole("button", { name: /Thursday, October 22, 2026/ });
    expect(selected).toHaveAttribute("tabindex", "0");
    selected.focus();
    await user.keyboard("{ArrowRight}");
    expect(within(sidebar).getByRole("button", { name: /Friday, October 23, 2026/ })).toHaveFocus();
    expect(selectedDate(router)).toBe("2026-10-22"); // only the focus moved
    await user.keyboard("{ArrowDown}{End}");
    expect(within(sidebar).getByRole("button", { name: /Sunday, November 1, 2026/ })).toHaveFocus();
    await user.keyboard("{PageDown}");
    expect(await within(sidebar).findByRole("grid", { name: "December 2026" })).toBeInTheDocument();
    expect(within(sidebar).getByRole("button", { name: /Tuesday, December 1, 2026/ })).toHaveFocus();
    await user.keyboard("{Enter}");
    await waitFor(() => {
      expect(selectedDate(router)).toBe("2026-12-01");
    });
  });

  it("collapses the sidebar and remembers it on this device", async () => {
    screenWidth(1280);
    const { user } = await open("/calendar?date=2026-10-22");
    const toggle = await screen.findByRole("button", { name: "Hide the sidebar" });
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    await user.click(toggle);
    expect(screen.queryByRole("complementary", { name: "Calendar sidebar" })).not.toBeInTheDocument();
    expect(window.localStorage.getItem("haalendar.calendar.sidebar")).toBe("collapsed");
    expect(screen.getByRole("button", { name: "Show the sidebar" })).toHaveAttribute("aria-expanded", "false");
  });

  it("starts the week on the day from the settings", async () => {
    screenWidth(1280);
    await open("/calendar?date=2026-10-22", { "GET /me/settings": () => json(settings({ week_start: 0 })) });
    const grid = await screen.findByRole("grid", { name: "October 2026" });
    await waitFor(() => {
      expect(within(grid).getAllByRole("columnheader")[0]).toHaveAttribute("abbr", "Sunday");
    });
  });
});

describe("tablet and phone", () => {
  it("tablet: the sidebar is an overlay", async () => {
    screenWidth(900);
    const { router, user } = await open("/calendar?date=2026-10-22");
    expect(screen.queryByRole("complementary", { name: "Calendar sidebar" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Show the sidebar" }));
    const sheet = await screen.findByRole("dialog", { name: "Calendar sidebar" });
    await user.click(within(sheet).getByRole("button", { name: /Monday, October 26, 2026/ }));
    await waitFor(() => {
      expect(selectedDate(router)).toBe("2026-10-26");
    });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("phone: the date button opens the mini month as a sheet", async () => {
    screenWidth(360);
    const { router, user } = await open("/calendar?date=2026-10-22");
    expect(screen.queryByRole("button", { name: /sidebar/ })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Thursday, October 22, 2026 — choose another date" }));
    const dialog = await screen.findByRole("dialog", { name: "Choose a date" });
    await user.click(within(dialog).getByRole("button", { name: /Sunday, November 1, 2026/ }));
    await waitFor(() => {
      expect(selectedDate(router)).toBe("2026-11-01");
    });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});
