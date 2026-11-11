// +++===+++ 2026-10-19 — Hasan Alizada — HAAL-045. The TypeScript implementation must pass the shared cases.
import { describe, expect, it } from "vitest";

import vectors from "../../../../atoms/calendar.week_ab_label.v1/vectors.json";

import { LabelsNotDistinctError, labelWeek, type WeekAbInput, weekStartOf } from "./weekAbLabel";

interface Case {
  name: string;
  input: Omit<WeekAbInput, "labels"> & { labels: string[] };
  output?: { label: string; index: number; weeks_from_anchor: number };
  error?: string;
}

describe("calendar.week_ab_label.v1 (TypeScript)", () => {
  it.each((vectors as { cases: Case[] }).cases.map((c) => [c.name, c] as const))("%s", (_name, testCase) => {
    const input = { ...testCase.input, labels: testCase.input.labels as unknown as readonly [string, string] };
    if (testCase.error) {
      expect(() => labelWeek(input)).toThrow(LabelsNotDistinctError);
      try {
        labelWeek(input);
      } catch (error) {
        expect((error as LabelsNotDistinctError).code).toBe(testCase.error);
      }
      return;
    }
    expect(labelWeek(input)).toEqual(testCase.output);
  });

  it("gives every day of a week the same label, for every week start", () => {
    for (let weekStart = 0; weekStart <= 6; weekStart += 1) {
      const labels = new Set<string>();
      for (let d = 1; d <= 7; d += 1) {
        const date = `2027-03-${String(d).padStart(2, "0")}`;
        if (weekStartOf(date, weekStart) === weekStartOf("2027-03-01", weekStart)) {
          labels.add(labelWeek({ date, anchor: "2026-10-19", week_start: weekStart, labels: ["A", "B"] }).label);
        }
      }
      expect(labels.size).toBe(1);
    }
  });

  it("refuses an out-of-range week start", () => {
    expect(() => weekStartOf("2026-01-01", 7)).toThrow("week_start");
  });
});
