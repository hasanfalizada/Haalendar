// +++===+++ 2026-10-23 — Hasan Alizada — HAAL-062. Calendar header (FR-CAL-05, F-05, D-63): "Today" or the long date as
// the page heading with the weekday, the ISO week of the SELECTED date (also across New Year, with the ISO year when it
// differs), the Day Number of the SELECTED date (HAAL-082), the Week A/B badge (HAAL-085) and the live clock (ticks on the second, stops in a hidden tab, 12/24 hours, profile zone).
import "@/i18n";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { settingsQueryKey } from "@/api/settings";
import { meQueryKey } from "@/api/session";
import { LiveClock } from "@/components/calendar/HeaderInfo";
import { todayIn } from "@/lib/datetime";

import { json, me, renderApp, settings, stubApi } from "./fake-api";

async function open(date: string) {
  stubApi({ "GET /me": () => json(me()) });
  renderApp(`/calendar?date=${date}`);
  return screen.findByRole("heading", { level: 1, name: /^Calendar:/ });
}

describe("title and week", () => {
  it("says Today for today and the long date otherwise, with the weekday", async () => {
    const today = todayIn(me().time_zone);
    expect(await open(today)).toHaveTextContent(/Today/);
    expect(screen.getByRole("button", { name: "Today" })).toBeDisabled();
  });

  it("shows the ISO week of the selected date, not of today", async () => {
    const heading = await open("2026-12-31");
    expect(heading).toHaveTextContent("December 31, 2026");
    expect(heading).toHaveAccessibleName(/^Calendar: .*December 31, 2026/);
    expect(screen.getByText("Week 53")).toHaveAttribute("title", "ISO week 53 of 2026");
  });

  it("names the ISO year when it differs from the calendar year", async () => {
    await open("2027-01-01");
    expect(await screen.findByText("Week 53 · 2026")).toBeInTheDocument();
  });
});

describe("day number", () => {
  it("shows the day of the year of the selected date, with the year length for the tooltip and screen readers", async () => {
    await open("2026-12-31");
    const label = screen.getByTitle("Day 365 of 365");
    expect(label).toHaveTextContent("Day 365");
    expect(screen.getByText("Day 365 of 365")).toHaveClass("sr-only");
  });

  it("counts the leap day and follows navigation into the next year", async () => {
    await open("2028-12-31");
    expect(screen.getByTitle("Day 366 of 366")).toBeInTheDocument();
    act(() => {
      screen.getByRole("button", { name: "Next day" }).click();
    });
    expect(await screen.findByTitle("Day 1 of 365")).toBeInTheDocument();
  });
});

// +++===+++ 2026-10-28 — Hasan Alizada — HAAL-085. Week A/B badge of the selected date: from the user's settings,
// right across the year boundary and a 53-week year, cut by the user's week start; hidden when off or without anchor.
describe("week A/B", () => {
  async function openWith(date: string, weekAb: ReturnType<typeof settings>["week_ab"], weekStart = 1) {
    stubApi({
      "GET /me": () => json(me()),
      "GET /me/settings": () => json(settings({ week_start: weekStart, week_ab: weekAb })),
    });
    renderApp(`/calendar?date=${date}`);
    await screen.findByRole("heading", { level: 1, name: /^Calendar:/ });
  }

  it("shows the label of the selected week after the ISO week, across New Year and week 53", async () => {
    await openWith("2026-12-31", { enabled: true, anchor: "2026-12-28", labels: ["Odd", "Even"] });
    const badge = await screen.findByTitle(
      "Week label Odd — alternates weekly from the week of Monday, December 28, 2026",
    );
    expect(badge).toHaveTextContent("Odd");
    expect(screen.getByText("Week label: Odd")).toHaveClass("sr-only");
    act(() => {
      screen.getByRole("button", { name: "Next day" }).click(); // 2027-01-01, still ISO week 53 of 2026
    });
    expect(await screen.findByText("Week 53 · 2026")).toBeInTheDocument();
    expect(screen.getByText("Week label: Odd")).toBeInTheDocument();
    for (const day of [2, 3, 4]) {
      act(() => {
        screen.getByRole("button", { name: "Next day" }).click();
      });
      await screen.findByRole("heading", { level: 1, name: new RegExp(`January ${String(day)}, 2027`) });
    }
    expect(await screen.findByText("Week label: Even")).toBeInTheDocument(); // Monday 2027-01-04
  });

  it("changes on the user's week start, not on the ISO Monday", async () => {
    await openWith("2026-11-07", { enabled: true, anchor: "2026-11-01", labels: ["A", "B"] }, 0);
    expect(await screen.findByText("Week label: A")).toBeInTheDocument(); // Saturday
    act(() => {
      screen.getByRole("button", { name: "Next day" }).click(); // Sunday 2026-11-08
    });
    expect(await screen.findByText("Week label: B")).toBeInTheDocument();
  });

  it("is hidden when switched off or without an anchor week", async () => {
    await openWith("2026-11-10", { enabled: false, anchor: "2026-11-02", labels: ["A", "B"] });
    await screen.findByText("Week 46");
    expect(screen.queryByText(/^Week label/)).not.toBeInTheDocument();
  });

  it("is hidden while enabled without an anchor", async () => {
    await openWith("2026-11-10", { enabled: true, anchor: null, labels: ["A", "B"] });
    await screen.findByText("Week 46");
    expect(screen.queryByText(/^Week label/)).not.toBeInTheDocument();
  });
});

describe("live clock", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  function renderClock(timeFormat: "12h" | "24h" = "24h") {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
    client.setQueryData(meQueryKey, me());
    client.setQueryData(settingsQueryKey, settings({ time_format: timeFormat }));
    render(
      <QueryClientProvider client={client}>
        <LiveClock timeZone="Europe/Berlin" />
      </QueryClientProvider>,
    );
    return screen.getByRole("timer", { name: "Current time" });
  }

  it("ticks on the second in the profile zone and stops while the tab is hidden", () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] });
    vi.setSystemTime(new Date("2026-10-23T07:15:30.250Z")); // 09:15:30 in Berlin (CEST)
    const clock = renderClock();
    expect(clock).toHaveTextContent("09:15:30");
    act(() => {
      vi.advanceTimersByTime(750);
    });
    expect(clock).toHaveTextContent("09:15:31");

    const visibility = vi.spyOn(document, "visibilityState", "get").mockReturnValue("hidden");
    act(() => {
      document.dispatchEvent(new Event("visibilitychange"));
      vi.advanceTimersByTime(5000);
    });
    expect(clock).toHaveTextContent("09:15:31"); // no ticking in the background

    visibility.mockReturnValue("visible");
    act(() => {
      document.dispatchEvent(new Event("visibilitychange"));
    });
    expect(clock).toHaveTextContent("09:15:36"); // right again at once
    visibility.mockRestore();
  });

  it("follows the 12-hour setting", () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] });
    vi.setSystemTime(new Date("2026-10-23T13:05:09.000Z")); // 15:05:09 in Berlin
    expect(renderClock("12h")).toHaveTextContent(/^03:05:09\sPM$/);
  });
});
