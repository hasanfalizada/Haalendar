// +++===+++ 2026-10-28 — Hasan Alizada — HAAL-084. What moving to the next day writes (FR-CAL-20, D-73): a one-off
// event shifts its dates by one day keeping the times (stored in its own zone), a series gets a one-off copy of the
// occurrence on the next day.
import { describe, expect, it } from "vitest";

import { planMove } from "./moveNextDay";

const base = {
  id: "e1",
  kind: "event",
  container_id: "c1",
  tzid: "Europe/Berlin",
  version: 3,
  title: "Dentist",
  body: "Bring the card",
  color: "blue",
  priority: "high",
  location: "Main St 1",
};

describe("planMove", () => {
  it("shifts a timed one-off event by one day and keeps its times", () => {
    const row = {
      ...base,
      all_day: false,
      start_date: "2026-10-24",
      start_time: "23:30",
      end_date: "2026-10-25",
      end_time: "01:00",
      rrule: null,
    };
    expect(planMove(row, "2026-10-24")).toEqual({
      kind: "shift",
      id: "e1",
      version: 3,
      base: { start_date: "2026-10-24", end_date: "2026-10-25" },
      data: { start_date: "2026-10-25", end_date: "2026-10-26" },
    });
  });

  it("shifts a multi-day all-day event across the end of the month and the year", () => {
    const row = { ...base, all_day: true, start_date: "2026-12-30", end_date: "2026-12-31", rrule: null };
    expect(planMove(row, "2026-12-31")).toMatchObject({
      kind: "shift",
      data: { start_date: "2026-12-31", end_date: "2027-01-01" },
    });
    const february = { ...base, all_day: true, start_date: "2027-02-28", end_date: "2027-02-28", rrule: null };
    expect(planMove(february, "2027-02-28")).toMatchObject({
      data: { start_date: "2027-03-01", end_date: "2027-03-01" },
    });
  });

  it("leaves a missing end date out", () => {
    const row = { ...base, all_day: true, start_date: "2026-11-10", end_date: null, rrule: null, version: undefined };
    expect(planMove(row, "2026-11-10")).toEqual({
      kind: "shift",
      id: "e1",
      version: null,
      base: { start_date: "2026-11-10" },
      data: { start_date: "2026-11-11" },
    });
  });

  it("copies an occurrence of a series to the next day and excludes its date", () => {
    const row = {
      ...base,
      all_day: false,
      start_date: "2026-11-02",
      start_time: "10:00",
      end_date: "2026-11-02",
      end_time: "10:15",
      rrule: "FREQ=WEEKLY",
    };
    expect(planMove(row, "2026-11-09")).toEqual({
      kind: "occurrence",
      series: "e1",
      date: "2026-11-09",
      copy: {
        kind: "event",
        container_kind: "calendar",
        container_id: "c1",
        tzid: "Europe/Berlin",
        title: "Dentist",
        body: "Bring the card",
        color: "blue",
        priority: "high",
        location: "Main St 1",
        all_day: false,
        start_date: "2026-11-10",
        start_time: "10:00",
        end_date: "2026-11-10",
        end_time: "10:15",
        rrule: null,
      },
    });
  });
});
