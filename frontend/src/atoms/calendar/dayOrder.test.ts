// +++===+++ 2026-10-22 — Hasan Alizada — HAAL-060. The TypeScript implementation must pass the shared cases.
import { describe, expect, it } from "vitest";

import vectors from "../../../../atoms/calendar.day_order.v1/vectors.json";

import { type DayEntry, dayOrder, titleKey } from "./dayOrder";

interface Case {
  name: string;
  input: { entries: DayEntry[] };
  output: { keys: string[] };
}

describe("calendar.day_order.v1 (TypeScript)", () => {
  it.each((vectors as { cases: Case[] }).cases.map((c) => [c.name, c] as const))("%s", (_name, testCase) => {
    expect(dayOrder(testCase.input.entries)).toEqual(testCase.output.keys);
  });

  it("ignores case and accents in the title key", () => {
    expect(titleKey("Éclair")).toBe("eclair");
    expect(titleKey("ÄPFEL")).toBe("apfel");
  });
});
