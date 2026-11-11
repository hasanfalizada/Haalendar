// +++===+++ 2026-10-28 — Hasan Alizada — HAAL-089. Agenda parts (FR-CAL-27, D-77): the range from the selected date and
// only the days that have events, in the day order.
import { describe, expect, it } from "vitest";

import { agendaDays, agendaOf } from "./agendaView";
import { entriesOn, entriesOnDays } from "./dayView";

const event = (id: string, date: string, extra: Record<string, unknown> = {}) => ({
  id,
  kind: "event",
  title: id,
  tzid: "Europe/Berlin",
  all_day: true,
  start_date: date,
  end_date: date,
  start_time: null,
  end_time: null,
  rrule: null,
  deleted_at: null,
  ...extra,
});

describe("agendaDays", () => {
  it("counts the days from the selected date, across the year", () => {
    expect(agendaDays("2026-12-30", 4)).toEqual(["2026-12-30", "2026-12-31", "2027-01-01", "2027-01-02"]);
    expect(agendaDays("2026-10-28", 30)).toHaveLength(30);
    expect(agendaDays("2026-10-28", 0)).toEqual(["2026-10-28"]);
  });
});

describe("agendaOf", () => {
  it("keeps only days with events; a series and a multi-day event show on each of their days", () => {
    const rows = [
      event("trip", "2026-10-29", { end_date: "2026-10-30" }),
      event("weekly", "2026-10-21", { rrule: "FREQ=WEEKLY" }),
      event("gone", "2026-10-29", { deleted_at: "2026-10-27T10:00:00Z" }),
    ];
    const agenda = agendaOf(rows, agendaDays("2026-10-27", 5), "Europe/Berlin");
    expect(agenda.map(({ day, entries }) => [day, entries.map((e) => e.id)])).toEqual([
      ["2026-10-28", ["weekly"]],
      ["2026-10-29", ["trip"]],
      ["2026-10-30", ["trip"]],
    ]);
  });
});

describe("entriesOnDays", () => {
  it("gives every day the same entries as entriesOn, events of other zones included", () => {
    const rows = [
      event("trip", "2026-10-29", { end_date: "2026-11-02" }),
      event("weekly", "2026-10-21", { rrule: "FREQ=WEEKLY" }),
      // 08:00 in Auckland is the previous day in Los Angeles: found one day before its stored date.
      event("call", "2026-11-01", {
        tzid: "Pacific/Auckland",
        all_day: false,
        start_time: "08:00",
        end_time: "09:00",
      }),
      // 23:00 in Los Angeles is the next day in Auckland.
      event("late", "2026-10-30", {
        tzid: "America/Los_Angeles",
        all_day: false,
        start_time: "23:00",
        end_time: "23:30",
      }),
      event("before", "2026-10-01"),
    ];
    const days = agendaDays("2026-10-27", 10);
    for (const zone of ["America/Los_Angeles", "Pacific/Auckland", "Europe/Berlin"]) {
      const byDay = entriesOnDays(rows, days, zone);
      for (const day of days) expect(byDay.get(day)).toEqual(entriesOn(rows, day, zone));
    }
  });
});
