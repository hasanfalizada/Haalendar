// +++===+++ 2026-10-22 — Hasan Alizada — HAAL-060. The TypeScript implementation must pass the shared cases.
// +++===+++ 2026-11-18 16:37 +04 — Hasan Alizada — HAAL-185. Version 2: by time or by colour (D-111).
import { describe, expect, it } from "vitest";

import vectors from "../../../../atoms/calendar.day_order.v2/vectors.json";

import { type DayEntry, type DayOrderBy, dayOrder, titleKey } from "./dayOrder";

interface Case {
  name: string;
  input: { by: DayOrderBy; entries: DayEntry[] };
  output: { keys: string[] };
}

describe("calendar.day_order.v2 (TypeScript)", () => {
  it.each((vectors as { cases: Case[] }).cases.map((c) => [c.name, c] as const))("%s", (_name, testCase) => {
    expect(dayOrder(testCase.input.entries, testCase.input.by)).toEqual(testCase.output.keys);
  });

  it("ignores case and accents in the title key", () => {
    expect(titleKey("Éclair")).toBe("eclair");
    expect(titleKey("ÄPFEL")).toBe("apfel");
  });
});
