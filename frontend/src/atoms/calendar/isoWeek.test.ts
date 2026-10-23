// +++===+++ 2026-10-23 — Hasan Alizada — HAAL-062. The TypeScript implementation must pass the shared cases.
import { describe, expect, it } from "vitest";

import vectors from "../../../../atoms/calendar.iso_week.v1/vectors.json";

import { isoWeek } from "./isoWeek";

interface Case {
  name: string;
  input: { date: string };
  output: { week: number; week_year: number };
}

describe("calendar.iso_week.v1 (TypeScript)", () => {
  it.each((vectors as { cases: Case[] }).cases.map((c) => [c.name, c] as const))("%s", (_name, testCase) => {
    expect(isoWeek(testCase.input.date)).toEqual(testCase.output);
  });
});
