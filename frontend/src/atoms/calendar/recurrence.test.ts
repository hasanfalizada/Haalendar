// +++===+++ 2026-10-22 — Hasan Alizada — HAAL-066. The TypeScript implementation must pass the shared cases.
// +++===+++ 2026-10-29 — Hasan Alizada — HAAL-092. Version 2: its vectors, the rule check and the reading of rules.
import { describe, expect, it } from "vitest";

import vectors from "../../../../atoms/calendar.recurrence.v2/vectors.json";

import {
  RecurrenceError,
  type RecurrenceInput,
  checkRule,
  isSupportedRrule,
  occurrences,
  parseRule,
} from "./recurrence";

interface Case {
  name: string;
  input: RecurrenceInput;
  output?: { dates: string[] };
  error?: string;
}

describe("calendar.recurrence.v2 (TypeScript)", () => {
  it.each((vectors as { cases: Case[] }).cases.map((c) => [c.name, c] as const))("%s", (_name, testCase) => {
    if (testCase.error) {
      expect(() => occurrences(testCase.input)).toThrow(RecurrenceError);
      try {
        occurrences(testCase.input);
      } catch (error) {
        expect((error as RecurrenceError).code).toBe(testCase.error);
      }
      return;
    }
    expect(occurrences(testCase.input)).toEqual(testCase.output?.dates);
  });

  it("gives 367 dates in the largest daily window", () => {
    const dates = occurrences({
      start_date: "2026-01-01",
      rrule: "FREQ=DAILY",
      exceptions: [],
      from: "2026-01-01",
      to: "2027-01-02",
    });
    expect(dates).toHaveLength(367);
  });

  it("knows the supported rules", () => {
    expect(isSupportedRrule(null) && isSupportedRrule("FREQ=MONTHLY")).toBe(true);
    expect(isSupportedRrule("FREQ=HOURLY") || isSupportedRrule("FREQ=DAILY ")).toBe(false);
    expect(isSupportedRrule("FREQ=WEEKLY;INTERVAL=2;BYDAY=MO,WE;UNTIL=20271231")).toBe(true);
  });

  it("reads rules into their parts", () => {
    expect(parseRule("FREQ=WEEKLY;INTERVAL=2;BYDAY=WE,MO;COUNT=10")).toEqual({
      freq: "WEEKLY",
      interval: 2,
      weekdays: [0, 2],
      nth: null,
      monthDay: null,
      until: null,
      count: 10,
    });
    expect(parseRule("FREQ=MONTHLY;BYDAY=-1FR;UNTIL=20271231")).toMatchObject({ nth: [-1, 4], until: "2027-12-31" });
    expect(parseRule("FREQ=MONTHLY;BYMONTHDAY=-1")).toMatchObject({ monthDay: -1 });
  });

  it("tells whether the start fits the rule", () => {
    expect(() => {
      checkRule("2026-10-22", "FREQ=WEEKLY;BYDAY=TH");
    }).not.toThrow();
    expect(() => {
      checkRule("2026-10-22", "FREQ=WEEKLY;BYDAY=MO");
    }).toThrow("START_NOT_IN_RULE");
  });

  it("stops counting a long series once it has ended", () => {
    const dates = occurrences({
      start_date: "1950-01-31",
      rrule: "FREQ=MONTHLY;COUNT=999",
      exceptions: [],
      from: "2026-01-01",
      to: "2026-12-31",
    });
    expect(dates).toEqual(["01", "03", "05", "07", "08", "10", "12"].map((m) => `2026-${m}-31`));
  });
});
