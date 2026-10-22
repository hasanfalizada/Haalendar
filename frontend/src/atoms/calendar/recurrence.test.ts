// +++===+++ 2026-10-22 — Hasan Alizada — HAAL-066. The TypeScript implementation must pass the shared cases.
import { describe, expect, it } from "vitest";

import vectors from "../../../../atoms/calendar.recurrence.v1/vectors.json";

import { RecurrenceError, type RecurrenceInput, isSupportedRrule, occurrences } from "./recurrence";

interface Case {
  name: string;
  input: RecurrenceInput;
  output?: { dates: string[] };
  error?: string;
}

describe("calendar.recurrence.v1 (TypeScript)", () => {
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
  });
});
