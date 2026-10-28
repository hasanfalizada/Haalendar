// +++===+++ 2026-10-28 — Hasan Alizada — HAAL-087. Week view parts (FR-CAL-25, D-75): the week's days from the user's
// week start (also across New Year), timed blocks on the day's axis with overlapping events side by side, the title.
import { describe, expect, it } from "vitest";

import type { DayEntry } from "./dayView";
import { layoutDay, weekDays, weekTitle } from "./weekView";

function timed(key: string, start: string, end: string, extra: Partial<DayEntry> = {}): DayEntry {
  return {
    key,
    id: key,
    title: key,
    color: "blue",
    location: null,
    allDay: false,
    recurring: false,
    hasDescription: false,
    continues: false,
    goesOn: false,
    start,
    end,
    ...extra,
  };
}

const place = (entries: DayEntry[]) =>
  Object.fromEntries(layoutDay(entries).map((b) => [b.entry.key, [b.start, b.end, b.column, b.columns]]));

describe("weekDays", () => {
  it("starts on the user's week start, across the new year", () => {
    expect(weekDays("2026-12-31", 1)).toEqual([
      "2026-12-28",
      "2026-12-29",
      "2026-12-30",
      "2026-12-31",
      "2027-01-01",
      "2027-01-02",
      "2027-01-03",
    ]);
    expect(weekDays("2026-11-01", 0)[0]).toBe("2026-11-01"); // a Sunday, weeks from Sunday
    expect(weekDays("2026-11-07", 6)[0]).toBe("2026-11-07"); // a Saturday, weeks from Saturday
    expect(weekDays("2026-11-06", 6)[0]).toBe("2026-10-31");
  });
});

describe("layoutDay", () => {
  it("places events by time; separate events keep the full width", () => {
    expect(place([timed("a", "09:00", "09:30"), timed("b", "11:00", "12:15")])).toEqual({
      a: [540, 570, 0, 1],
      b: [660, 735, 0, 1],
    });
  });

  it("puts overlapping events side by side and reuses a free column", () => {
    const placed = place([
      timed("workshop", "10:00", "12:00"),
      timed("call", "10:30", "11:00"),
      timed("lunch", "11:30", "12:30"),
    ]);
    expect(placed).toEqual({ workshop: [600, 720, 0, 2], call: [630, 660, 1, 2], lunch: [690, 750, 1, 2] });
  });

  it("counts a short event at its drawn height and leaves all-day events out", () => {
    const placed = place([
      timed("ping", "09:00", "09:00"),
      timed("next", "09:15", "09:45"),
      { ...timed("holiday", "", ""), allDay: true, start: null, end: null },
    ]);
    expect(placed).toEqual({ ping: [540, 540, 0, 2], next: [555, 585, 1, 2] });
  });

  it("runs an event that continues from 00:00 and one that goes on to 24:00", () => {
    const placed = place([
      timed("night", "22:00", "02:00", { continues: true }),
      timed("late", "23:00", "01:00", { goesOn: true }),
    ]);
    expect(placed).toEqual({ night: [0, 120, 0, 1], late: [1380, 1440, 0, 1] });
  });
});

describe("weekTitle", () => {
  // Intl puts thin spaces around the dash.
  const title = (date: string) => weekTitle(weekDays(date, 1), "en").replace(/\s/g, " ");
  it("names the range in the interface language", () => {
    expect(title("2026-10-28")).toBe("October 26 – November 1, 2026");
    expect(title("2026-12-31")).toBe("December 28, 2026 – January 3, 2027");
  });
});
