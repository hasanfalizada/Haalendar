// +++===+++ 2026-10-28 — Hasan Alizada — HAAL-082. Day Number boundaries: first and last day of common and leap years,
// the leap day and the day after it, and years whose 1 January is in a far-off century.
import { describe, expect, it } from "vitest";

import { dayOfYear } from "./dayOfYear";

describe("dayOfYear", () => {
  it.each([
    ["2026-01-01", 1, 365],
    ["2026-12-31", 365, 365],
    ["2026-10-28", 301, 365],
    ["2028-01-01", 1, 366],
    ["2028-02-28", 59, 366],
    ["2028-02-29", 60, 366],
    ["2028-03-01", 61, 366],
    ["2028-12-31", 366, 366],
    ["2027-03-01", 60, 365],
    ["2100-12-31", 365, 365],
    ["2000-12-31", 366, 366],
  ])("%s is day %i of %i", (date, day, daysInYear) => {
    expect(dayOfYear(date)).toEqual({ day, daysInYear });
  });
});
