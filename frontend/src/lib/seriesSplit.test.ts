// +++===+++ 2026-10-29 — Hasan Alizada — HAAL-093. Splitting a series at an occurrence (FR-CAL-31, D-81): the series ends
// the day before (UNTIL, also in place of a COUNT), the later part keeps the remaining count, excluded dates from the
// occurrence on move into the new series when they fit it, and at the first remaining occurrence it is the whole series.
import { describe, expect, it } from "vitest";

import { occurrences } from "@/atoms/calendar/recurrence";
import { eventData, followingForm } from "@/lib/eventForm";

import { endedBefore, planSplit, splitsWhole } from "./seriesSplit";

const series = {
  id: "s1",
  version: 4,
  start_date: "2026-11-03",
  end_date: "2026-11-03",
  rrule: "FREQ=WEEKLY;COUNT=10",
  exceptions: ["2026-11-03", "2026-11-24", "2026-12-01"],
};

const dates = (start: string, rrule: string) =>
  occurrences({ start_date: start, rrule, exceptions: [], from: "2026-01-01", to: "2026-12-31" });

describe("splitting a series", () => {
  it("ends the series the day before, a count giving way to the date", () => {
    expect(endedBefore("FREQ=WEEKLY;COUNT=10", "2026-11-03", "2026-11-17")).toBe("FREQ=WEEKLY;UNTIL=20261116");
    expect(endedBefore("FREQ=MONTHLY;BYDAY=-1FR;UNTIL=20271231", "2026-11-27", "2027-01-29")).toBe(
      "FREQ=MONTHLY;BYDAY=-1FR;UNTIL=20270128",
    );
    expect(endedBefore("FREQ=WEEKLY;INTERVAL=2;BYDAY=TU,TH", "2026-11-03", "2026-11-19")).toBe(
      "FREQ=WEEKLY;INTERVAL=2;BYDAY=TU,TH;UNTIL=20261118",
    );
  });

  it("both parts together keep the dates of the series", () => {
    const later = eventData(followingForm(series, "2026-11-17"));
    expect(later).toMatchObject({ start_date: "2026-11-17", end_date: "2026-11-17", rrule: "FREQ=WEEKLY;COUNT=8" });
    const plan = planSplit(series, "2026-11-17", { ...later });
    expect(plan).toEqual({
      kind: "split",
      id: "s1",
      version: 4,
      at: "2026-11-17",
      base: { rrule: "FREQ=WEEKLY;COUNT=10" },
      data: { rrule: "FREQ=WEEKLY;UNTIL=20261116" },
      follow: later,
      exceptions: ["2026-11-24", "2026-12-01"],
    });
    expect([...dates("2026-11-03", plan.data.rrule), ...dates("2026-11-17", String(later.rrule))]).toEqual(
      dates("2026-11-03", series.rrule),
    );
  });

  it("carries only the excluded dates that fit the new series; delete has no new series", () => {
    const fridays = planSplit(series, "2026-11-17", { start_date: "2026-11-20", rrule: "FREQ=WEEKLY" });
    expect(fridays.exceptions).toEqual([]);
    expect(planSplit(series, "2026-11-17", { start_date: "2026-11-17", rrule: null }).exceptions).toEqual([]);
    expect(planSplit(series, "2026-11-17", null)).toMatchObject({ follow: null, exceptions: [] });
    // Moved by two days (drag and drop): the dates move along.
    expect(planSplit(series, "2026-11-17", { start_date: "2026-11-19", rrule: "FREQ=WEEKLY" }, 2).exceptions).toEqual([
      "2026-11-26",
      "2026-12-03",
    ]);
  });

  it("at the first remaining occurrence it is the whole series", () => {
    expect(splitsWhole(series, "2026-11-10")).toBe(true); // the 3rd is excluded
    expect(splitsWhole(series, "2026-11-17")).toBe(false);
    expect(splitsWhole({ ...series, exceptions: [] }, "2026-11-03")).toBe(true);
  });
});
