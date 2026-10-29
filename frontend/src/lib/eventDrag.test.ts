// +++===+++ 2026-10-28 — Hasan Alizada — HAAL-090. Where a dropped event lands and what that writes (FR-CAL-28, D-78):
// days keep the times, the time grid keeps the length (also over midnight and from another zone), a series moves one
// occurrence or all of them with its excluded dates.
// +++===+++ 2026-10-29 — Hasan Alizada — HAAL-092. The end date of a series moves along; a rule with its own days
// moves as a whole only to other times on the same day.
import { describe, expect, it } from "vitest";

import { droppedTimes, planDrop, seriesMovable } from "./eventDrag";

const base = {
  id: "e1",
  kind: "event",
  container_id: "c1",
  tzid: "Europe/Berlin",
  version: 2,
  title: "Workshop",
  body: null,
  color: "blue",
  priority: "medium",
  location: null,
  rrule: null,
};
const timed = {
  ...base,
  all_day: false,
  start_date: "2026-10-28",
  start_time: "10:00",
  end_date: "2026-10-28",
  end_time: "12:00",
};

describe("droppedTimes", () => {
  it("moves by whole days and keeps the times on a day drop", () => {
    expect(droppedTimes(timed, "2026-10-28", "2026-10-28", { day: "2026-10-30" }, "Europe/Berlin")).toEqual({
      start_date: "2026-10-30",
      start_time: "10:00",
      end_date: "2026-10-30",
      end_time: "12:00",
    });
    const trip = { ...base, all_day: true, start_date: "2026-10-29", end_date: "2026-11-01" };
    // Dragged from its third day (31 October) to 2 November: two days later.
    expect(droppedTimes(trip, "2026-10-29", "2026-10-31", { day: "2026-11-02" }, "Europe/Berlin")).toEqual({
      start_date: "2026-10-31",
      start_time: null,
      end_date: "2026-11-03",
      end_time: null,
    });
  });

  it("takes the new start from the time grid and keeps the length, over midnight too", () => {
    expect(
      droppedTimes(timed, "2026-10-28", "2026-10-28", { day: "2026-10-29", minutes: 23 * 60 }, "Europe/Berlin"),
    ).toEqual({ start_date: "2026-10-29", start_time: "23:00", end_date: "2026-10-30", end_time: "01:00" });
  });

  it("turns a drop in the viewer's zone into the event's zone", () => {
    // Shown in Baku (UTC+4) at 13:00–15:00; dropped at 16:00 Baku = 13:00 Berlin (UTC+1 after 25 October).
    expect(
      droppedTimes(timed, "2026-10-28", "2026-10-28", { day: "2026-10-28", minutes: 16 * 60 }, "Asia/Baku"),
    ).toEqual({ start_date: "2026-10-28", start_time: "13:00", end_date: "2026-10-28", end_time: "15:00" });
  });

  it("is null when nothing moves", () => {
    expect(droppedTimes(timed, "2026-10-28", "2026-10-28", { day: "2026-10-28" }, "Europe/Berlin")).toBeNull();
    expect(
      droppedTimes(timed, "2026-10-28", "2026-10-28", { day: "2026-10-28", minutes: 600 }, "Europe/Berlin"),
    ).toBeNull();
  });
});

describe("planDrop", () => {
  const next = { start_date: "2026-10-30", start_time: "15:00", end_date: "2026-10-30", end_time: "17:00" };

  it("updates only the changed fields of an event", () => {
    expect(planDrop(timed, "2026-10-28", next, "this")).toEqual({
      kind: "shift",
      id: "e1",
      version: 2,
      base: { start_date: "2026-10-28", start_time: "10:00", end_date: "2026-10-28", end_time: "12:00" },
      data: { start_date: "2026-10-30", start_time: "15:00", end_date: "2026-10-30", end_time: "17:00" },
    });
  });

  it("copies one occurrence of a series to the new place", () => {
    const series = { ...timed, start_date: "2026-10-26", end_date: "2026-10-26", rrule: "FREQ=DAILY" };
    expect(planDrop(series, "2026-10-28", next, "this")).toMatchObject({
      kind: "occurrence",
      series: "e1",
      date: "2026-10-28",
      copy: { title: "Workshop", rrule: null, container_id: "c1", tzid: "Europe/Berlin", ...next },
    });
  });

  it("moves all occurrences by the same days and their excluded dates along", () => {
    const series = {
      ...timed,
      start_date: "2026-10-26",
      end_date: "2026-10-26",
      rrule: "FREQ=WEEKLY",
      exceptions: ["2026-11-02"],
    };
    expect(planDrop(series, "2026-10-28", next, "all")).toEqual({
      kind: "series",
      id: "e1",
      version: 2,
      base: { start_date: "2026-10-26", start_time: "10:00", end_date: "2026-10-26", end_time: "12:00" },
      data: { start_date: "2026-10-28", start_time: "15:00", end_date: "2026-10-28", end_time: "17:00" },
      exceptions: [{ from: "2026-11-02", to: "2026-11-04" }],
    });
  });

  it("moves the end date of the series along; a rule with its own days stays on its days", () => {
    const series = {
      ...timed,
      start_date: "2026-10-26",
      end_date: "2026-10-26",
      rrule: "FREQ=WEEKLY;UNTIL=20261130",
    };
    expect(planDrop(series, "2026-10-28", next, "all")).toMatchObject({
      base: { rrule: "FREQ=WEEKLY;UNTIL=20261130" },
      data: { start_date: "2026-10-28", rrule: "FREQ=WEEKLY;UNTIL=20261202" },
    });
    const ownDays = { ...series, rrule: "FREQ=WEEKLY;BYDAY=MO,WE" };
    expect(seriesMovable(ownDays, "2026-10-28", next)).toBe(false); // to Friday
    expect(seriesMovable(ownDays, "2026-10-28", { ...next, start_date: "2026-10-28", end_date: "2026-10-28" })).toBe(
      true,
    ); // other times on the same day
    expect(seriesMovable(series, "2026-10-28", next)).toBe(true);
  });
});
